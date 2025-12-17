// Route Handler for AI Chat - /api/ai/chat
// Full integration with AI SDK v6 ToolLoopAgent + createAgentUIStreamResponse

import { createAgentUIStreamResponse, UIMessage } from 'ai';
import { createCRMAgent } from '@/lib/ai/crmAgent';
import { createClient } from '@/lib/supabase/server';
import type { CRMCallOptions } from '@/types/ai';
import { isAllowedOrigin } from '@/lib/security/sameOrigin';

export const maxDuration = 60;

export async function POST(req: Request) {
    // Mitigação CSRF: endpoint autenticado por cookies.
    if (!isAllowedOrigin(req)) {
        return new Response('Forbidden', { status: 403 });
    }

    const supabase = await createClient();

    // 0. Parse request body early (we may need boardId to recover a missing profile.organization_id)
    const body = await req.json().catch(() => null);
    const messages: UIMessage[] = (body?.messages ?? []) as UIMessage[];
    const rawContext = (body?.context ?? {}) as Record<string, unknown>;

    // 1. Auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return new Response('Unauthorized', { status: 401 });
    }

    // 2. Get profile with organization + role (RBAC)
    const { data: profile } = await supabase
        .from('profiles')
        .select('organization_id, first_name, nickname, role')
        .eq('id', user.id)
        .single();

    // Alguns usuários legados podem existir sem organization_id no profile (ex.: signup sem raw_user_meta_data).
    // Se veio boardId no contexto e o board é visível para o usuário autenticado (RLS), inferimos a org com segurança.
    let organizationId = profile?.organization_id ?? null;
    if (!organizationId) {
        const boardId = typeof rawContext?.boardId === 'string' ? rawContext.boardId : null;
        if (boardId) {
            const { data: board, error: boardError } = await supabase
                .from('boards')
                .select('organization_id')
                .eq('id', boardId)
                .maybeSingle();

            if (boardError) {
                console.warn('[AI Chat] Failed to infer organization from board:', { boardId, message: boardError.message });
            }

            if (board?.organization_id) {
                organizationId = board.organization_id;

                // Best-effort: persistir no profile para corrigir de vez.
                const { error: updateProfileError } = await supabase
                    .from('profiles')
                    .update({ organization_id: organizationId, updated_at: new Date().toISOString() })
                    .eq('id', user.id);

                if (updateProfileError) {
                    console.warn('[AI Chat] Failed to backfill profile.organization_id:', { message: updateProfileError.message });
                }
            }
        }
    }

    if (!organizationId) {
        return new Response(
            'Profile sem organização. Finalize o setup (ou re-login) para vincular seu usuário a uma organização antes de usar a IA.',
            { status: 409 }
        );
    }

    // 3. Get API key (org-wide: organization_settings é a fonte de verdade)
    const { data: orgSettings } = await supabase
        .from('organization_settings')
        .select('ai_google_key, ai_model')
        .eq('organization_id', organizationId)
        .maybeSingle();

    const apiKey: string | null = orgSettings?.ai_google_key ?? null;
    const modelId: string | null = orgSettings?.ai_model ?? null;

    if (!apiKey) {
        return new Response('API key not configured. Configure em Configurações → Inteligência Artificial.', { status: 400 });
    }

    const resolvedModelId = modelId || 'gemini-2.5-flash';

    // 5. Build type-safe context for agent
    const context: CRMCallOptions = {
        organizationId,
        boardId: rawContext.boardId,
        dealId: rawContext.dealId,
        contactId: rawContext.contactId,
        boardName: rawContext.boardName,
        stages: rawContext.stages,
        dealCount: rawContext.dealCount,
        pipelineValue: rawContext.pipelineValue,
        stagnantDeals: rawContext.stagnantDeals,
        overdueDeals: rawContext.overdueDeals,
        wonStage: rawContext.wonStage,
        lostStage: rawContext.lostStage,
        userId: user.id,
        userName: profile.nickname || profile.first_name || user.email,
        userRole: (profile as any)?.role,
    };

    console.log('[AI Chat] 📨 Request received:', {
        messagesCount: messages?.length,
        rawContext,
        context: {
            organizationId: context.organizationId,
            boardId: context.boardId,
            dealId: context.dealId,
            boardName: context.boardName,
            stagesCount: context.stages?.length,
            userName: context.userName,
        },
    });

    // 6. Create agent with API key and context
    const agent = await createCRMAgent(context, user.id, apiKey, resolvedModelId);

    // 7. Return streaming response using AI SDK v6 createAgentUIStreamResponse
    return createAgentUIStreamResponse({
        agent,
        messages,
        options: context,
    });
}
