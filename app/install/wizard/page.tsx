'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, Shield } from 'lucide-react';

type InstallerMeta = {
  enabled: boolean;
  requiresToken: boolean;
};

type ProjectInfo = {
  id: string;
  name: string;
  teamId?: string;
  url?: string;
};

type SupabaseProjectOption = {
  ref: string;
  name: string;
  region?: string;
  status?: string;
  supabaseUrl: string;
};

type SupabaseOrgOption = { slug: string; name: string; id?: string };

type Step = {
  id: string;
  status: 'ok' | 'error' | 'warning' | 'running';
  message?: string;
};

type FunctionResult =
  | { slug: string; ok: true; response: unknown }
  | { slug: string; ok: false; error: string; status?: number; response?: unknown };

type RunResult = {
  ok: boolean;
  steps: Step[];
  functions?: FunctionResult[];
  error?: string;
};

const wizardSteps = [
  { id: 'vercel', label: 'Vercel' },
  { id: 'supabase', label: 'Supabase' },
  { id: 'admin', label: 'Admin' },
  { id: 'review', label: 'Review' },
];

const STORAGE_TOKEN = 'crm_install_token';
const STORAGE_PROJECT = 'crm_install_project';
const STORAGE_INSTALLER_TOKEN = 'crm_install_installer_token';

const shouldShowTokenHelp = (message: string) => {
  const text = message.toLowerCase();
  return text.includes('vercel') && text.includes('token');
};

function maskValue(value: string, start = 4, end = 4) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.length <= start + end) return `${trimmed.slice(0, start)}...`;
  return `${trimmed.slice(0, start)}...${trimmed.slice(-end)}`;
}

/**
 * Componente React `InstallWizardPage`.
 * @returns {Element} Retorna um valor do tipo `Element`.
 */
export default function InstallWizardPage() {
  const router = useRouter();
  const [meta, setMeta] = useState<InstallerMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  const inferProjectRefFromSupabaseUrl = (value: string): string | null => {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      const m1 = host.match(/^([a-z0-9-]+)\.supabase\.co$/i);
      if (m1?.[1]) return m1[1];
      const m2 = host.match(/^([a-z0-9-]+)\.supabase\.in$/i);
      if (m2?.[1]) return m2[1];
      return null;
    } catch {
      return null;
    }
  };

  const [installerToken, setInstallerToken] = useState('');
  const [vercelToken, setVercelToken] = useState('');
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [supabaseServiceKey, setSupabaseServiceKey] = useState('');
  const [supabaseDbUrl, setSupabaseDbUrl] = useState('');
  const [supabaseAccessToken, setSupabaseAccessToken] = useState('');
  const [supabaseProjectRef, setSupabaseProjectRef] = useState('');
  const [supabaseProjectRefTouched, setSupabaseProjectRefTouched] = useState(false);
  const [supabaseDeployEdgeFunctions, setSupabaseDeployEdgeFunctions] = useState(true);
  const [supabaseAdvanced, setSupabaseAdvanced] = useState(false);
  const [supabaseResolving, setSupabaseResolving] = useState(false);
  const [supabaseResolveError, setSupabaseResolveError] = useState<string | null>(null);
  const [supabaseResolvedOk, setSupabaseResolvedOk] = useState(false);
  const [supabaseResolvedLabel, setSupabaseResolvedLabel] = useState<string | null>(null);
  const [supabaseMode, setSupabaseMode] = useState<'existing' | 'create'>('existing');
  const [supabaseProjectsLoading, setSupabaseProjectsLoading] = useState(false);
  const [supabaseProjectsError, setSupabaseProjectsError] = useState<string | null>(null);
  const [supabaseProjects, setSupabaseProjects] = useState<SupabaseProjectOption[]>([]);
  const [supabaseSelectedProjectRef, setSupabaseSelectedProjectRef] = useState('');
  const [supabaseProjectsLoadedForPat, setSupabaseProjectsLoadedForPat] = useState<string>('');

  const [supabaseOrgsLoading, setSupabaseOrgsLoading] = useState(false);
  const [supabaseOrgsError, setSupabaseOrgsError] = useState<string | null>(null);
  const [supabaseOrgs, setSupabaseOrgs] = useState<SupabaseOrgOption[]>([]);
  const [supabaseCreateOrgSlug, setSupabaseCreateOrgSlug] = useState('');
  const [supabaseCreateName, setSupabaseCreateName] = useState('');
  const [supabaseCreateDbPass, setSupabaseCreateDbPass] = useState('');
  const [supabaseCreateRegion, setSupabaseCreateRegion] = useState<'americas' | 'emea' | 'apac'>('americas');
  const [supabaseCreating, setSupabaseCreating] = useState(false);
  const [supabaseCreateError, setSupabaseCreateError] = useState<string | null>(null);

  const [edgeFunctionsPreview, setEdgeFunctionsPreview] = useState<
    Array<{ slug: string; verify_jwt: boolean }>
  >([]);
  const [edgeFunctionsPreviewLoading, setEdgeFunctionsPreviewLoading] = useState(false);
  const [edgeFunctionsPreviewError, setEdgeFunctionsPreviewError] = useState<string | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [targets, setTargets] = useState({ production: true, preview: true });
  const [currentStep, setCurrentStep] = useState(0);

  const [installing, setInstalling] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch('/api/installer/meta');
        const data = await res.json();
        if (!cancelled) setMeta(data);
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to load installer metadata';
          setMetaError(message);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem(STORAGE_TOKEN);
    const savedProject = localStorage.getItem(STORAGE_PROJECT);
    const savedInstallerToken = localStorage.getItem(STORAGE_INSTALLER_TOKEN);

    if (!savedToken || !savedProject) {
      router.replace('/install/start');
      return;
    }

    try {
      const parsedProject = JSON.parse(savedProject) as ProjectInfo;
      setVercelToken(savedToken);
      setProject(parsedProject);
      if (savedInstallerToken) setInstallerToken(savedInstallerToken);
      setIsHydrated(true);
    } catch {
      localStorage.removeItem(STORAGE_PROJECT);
      router.replace('/install/start');
    }
  }, [router]);

  useEffect(() => {
    if (installerToken.trim()) {
      localStorage.setItem(STORAGE_INSTALLER_TOKEN, installerToken.trim());
    }
  }, [installerToken]);

  useEffect(() => {
    if (!supabaseDeployEdgeFunctions) return;
    if (supabaseProjectRefTouched) return;
    const inferred = inferProjectRefFromSupabaseUrl(supabaseUrl.trim());
    if (inferred) setSupabaseProjectRef(inferred);
  }, [supabaseDeployEdgeFunctions, supabaseProjectRefTouched, supabaseUrl]);

  useEffect(() => {
    // If the user changes the base inputs, we should consider the previous resolution stale.
    setSupabaseResolvedOk(false);
    setSupabaseResolvedLabel(null);
  }, [supabaseUrl, supabaseAccessToken]);

  useEffect(() => {
    // “Bruxaria”: se URL + PAT estiverem preenchidos, tenta auto-preencher com debounce.
    if (!supabaseDeployEdgeFunctions) return;
    if (!supabaseUrl.trim() || !supabaseAccessToken.trim()) return;
    if (supabaseResolving || supabaseResolvedOk) return;

    const handle = setTimeout(() => {
      void resolveSupabase();
    }, 650);

    return () => clearTimeout(handle);
  }, [supabaseDeployEdgeFunctions, supabaseUrl, supabaseAccessToken]);

  const selectedTargets = useMemo(() => {
    return (Object.entries(targets).filter(([, v]) => v).map(([k]) => k) as Array<
      'production' | 'preview'
    >);
  }, [targets]);

  const passwordValid = adminPassword.length >= 6;
  const passwordsMatch =
    adminPassword.length > 0 && adminPassword === confirmPassword;

  const vercelReady = Boolean(
    (!meta?.requiresToken || installerToken.trim()) &&
      vercelToken.trim() &&
      project?.id &&
      selectedTargets.length > 0
  );

  const supabaseReady = Boolean(
    supabaseUrl.trim() &&
      (!supabaseDeployEdgeFunctions || supabaseAccessToken.trim())
  );

  const adminReady = Boolean(
    companyName.trim() && adminEmail.trim() && passwordValid && passwordsMatch
  );

  const canInstall = Boolean(meta?.enabled && vercelReady && supabaseReady && adminReady);
  const stepReady = [vercelReady, supabaseReady, adminReady, canInstall];

  const runInstaller = async () => {
    if (!canInstall || installing || !project) return;
    setInstalling(true);
    setRunError(null);
    setResult(null);

    try {
      const res = await fetch('/api/installer/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          installerToken: installerToken.trim() || undefined,
          vercel: {
            token: vercelToken.trim(),
            teamId: project.teamId,
            projectId: project.id,
            targets: selectedTargets,
          },
          supabase: {
            url: supabaseUrl.trim(),
            anonKey: supabaseAnonKey.trim() || undefined,
            serviceRoleKey: supabaseServiceKey.trim() || undefined,
            dbUrl: supabaseDbUrl.trim() || undefined,
            accessToken: supabaseAccessToken.trim() || undefined,
            projectRef: supabaseProjectRef.trim() || undefined,
            deployEdgeFunctions: supabaseDeployEdgeFunctions,
          },
          admin: {
            companyName: companyName.trim(),
            email: adminEmail.trim(),
            password: adminPassword,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Installer failed (HTTP ${res.status})`);
      }
      setResult(data as RunResult);
      if (!data?.ok && data?.error) {
        setRunError(data.error);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Installer failed';
      setRunError(message);
    } finally {
      setInstalling(false);
    }
  };

  const statusColor = (status: Step['status']) => {
    switch (status) {
      case 'ok':
        return 'text-emerald-600 dark:text-emerald-400';
      case 'warning':
        return 'text-amber-600 dark:text-amber-400';
      case 'error':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-slate-500 dark:text-slate-400';
    }
  };

  const redeployWarning =
    result?.steps?.find((step) => step.id === 'vercel_redeploy' && step.status === 'warning') ||
    null;

  const progress =
    wizardSteps.length > 1
      ? Math.round((currentStep / (wizardSteps.length - 1)) * 100)
      : 0;

  const goNext = () => {
    if (!stepReady[currentStep]) return;
    setCurrentStep((step) => Math.min(step + 1, wizardSteps.length - 1));
  };

  const goBack = () => {
    setCurrentStep((step) => Math.max(step - 1, 0));
  };

  const resolveSupabase = async () => {
    if (supabaseResolving) return;
    setSupabaseResolveError(null);
    setSupabaseResolving(true);
    setSupabaseResolvedOk(false);
    setSupabaseResolvedLabel(null);

    try {
      const res = await fetch('/api/installer/supabase/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          installerToken: installerToken.trim() || undefined,
          accessToken: supabaseAccessToken.trim(),
          supabaseUrl: supabaseUrl.trim() || undefined,
          projectRef: supabaseProjectRef.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || `Falha ao resolver Supabase (HTTP ${res.status})`);
      }

      if (data?.projectRef && !supabaseProjectRefTouched) {
        setSupabaseProjectRef(String(data.projectRef));
      }
      if (typeof data?.publishableKey === 'string') setSupabaseAnonKey(data.publishableKey);
      if (typeof data?.secretKey === 'string') setSupabaseServiceKey(data.secretKey);
      if (typeof data?.dbUrl === 'string') setSupabaseDbUrl(data.dbUrl);

      const warnings = Array.isArray(data?.warnings) ? data.warnings : [];
      if (warnings.length > 0) {
        setSupabaseResolveError(`Alguns itens não foram resolvidos: ${warnings.join(' | ')}`);
        setSupabaseAdvanced(true);
      } else {
        const pubType =
          typeof data?.publishableKeyType === 'string' ? String(data.publishableKeyType) : 'publishable/anon';
        const secType =
          typeof data?.secretKeyType === 'string' ? String(data.secretKeyType) : 'secret/service_role';

        setSupabaseResolvedOk(true);
        setSupabaseResolvedLabel(`OK — chaves (${pubType}/${secType}) e DB resolvidos`);
        setSupabaseAdvanced(false);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao resolver Supabase';
      setSupabaseResolveError(message);
      setSupabaseAdvanced(true);
    } finally {
      setSupabaseResolving(false);
    }
  };

  const loadSupabaseProjects = async () => {
    if (supabaseProjectsLoading) return;
    setSupabaseProjectsError(null);
    setSupabaseProjectsLoading(true);
    try {
      const res = await fetch('/api/installer/supabase/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          installerToken: installerToken.trim() || undefined,
          accessToken: supabaseAccessToken.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Falha ao listar projetos (HTTP ${res.status})`);
      setSupabaseProjects((data?.projects || []) as SupabaseProjectOption[]);
      setSupabaseProjectsLoadedForPat(supabaseAccessToken.trim());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao listar projetos';
      setSupabaseProjectsError(message);
    } finally {
      setSupabaseProjectsLoading(false);
    }
  };

  const loadSupabaseOrgs = async () => {
    if (supabaseOrgsLoading) return;
    setSupabaseOrgsError(null);
    setSupabaseOrgsLoading(true);
    try {
      const res = await fetch('/api/installer/supabase/organizations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          installerToken: installerToken.trim() || undefined,
          accessToken: supabaseAccessToken.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Falha ao listar orgs (HTTP ${res.status})`);
      setSupabaseOrgs((data?.organizations || []) as SupabaseOrgOption[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao listar orgs';
      setSupabaseOrgsError(message);
    } finally {
      setSupabaseOrgsLoading(false);
    }
  };

  useEffect(() => {
    // “100% mágico”: ao colar o PAT, lista projetos automaticamente (com debounce) e evita spam.
    if (!supabaseDeployEdgeFunctions) return;
    if (supabaseMode !== 'existing') return;
    const pat = supabaseAccessToken.trim();
    if (!pat) return;
    if (supabaseProjectsLoading) return;
    if (supabaseProjectsLoadedForPat === pat) return;

    const handle = setTimeout(() => {
      void loadSupabaseProjects();
    }, 650);

    return () => clearTimeout(handle);
  }, [
    supabaseDeployEdgeFunctions,
    supabaseMode,
    supabaseAccessToken,
    supabaseProjectsLoading,
    supabaseProjectsLoadedForPat,
  ]);

  useEffect(() => {
    // Se o aluno trocar o PAT, limpamos a seleção (evita selecionar projeto “de outro token”).
    setSupabaseSelectedProjectRef('');
  }, [supabaseAccessToken]);

  const createSupabaseProject = async () => {
    if (supabaseCreating) return;
    setSupabaseCreateError(null);
    setSupabaseCreating(true);
    try {
      const res = await fetch('/api/installer/supabase/create-project', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          installerToken: installerToken.trim() || undefined,
          accessToken: supabaseAccessToken.trim(),
          organizationSlug: supabaseCreateOrgSlug.trim(),
          name: supabaseCreateName.trim(),
          dbPass: supabaseCreateDbPass,
          regionSmartGroup: supabaseCreateRegion,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Falha ao criar projeto (HTTP ${res.status})`);

      // Auto-select the created project and move on to resolving keys/db.
      const ref = String(data?.projectRef || '');
      const url = String(data?.supabaseUrl || '');
      if (ref) {
        setSupabaseSelectedProjectRef(ref);
        setSupabaseProjectRef(ref);
      }
      if (url) setSupabaseUrl(url);

      // Immediately resolve keys/db.
      await resolveSupabase();
      setSupabaseMode('existing');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao criar projeto';
      setSupabaseCreateError(message);
    } finally {
      setSupabaseCreating(false);
    }
  };

  const loadEdgeFunctionsPreview = async () => {
    if (edgeFunctionsPreviewLoading) return;
    setEdgeFunctionsPreviewError(null);
    setEdgeFunctionsPreviewLoading(true);
    try {
      const res = await fetch('/api/installer/supabase/functions');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Falha ao listar Edge Functions (HTTP ${res.status})`);
      setEdgeFunctionsPreview((data?.functions || []) as Array<{ slug: string; verify_jwt: boolean }>);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao listar Edge Functions';
      setEdgeFunctionsPreviewError(message);
    } finally {
      setEdgeFunctionsPreviewLoading(false);
    }
  };

  const handleResetProject = () => {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_PROJECT);
    router.push('/install/start');
  };

  if (!isHydrated) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-dark-bg flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-dark-bg relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] bg-primary-500/20 rounded-full blur-[120px]" />
        <div className="absolute top-[40%] -left-[10%] w-[40%] h-[40%] bg-blue-500/20 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-2xl relative z-10 px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary-500/10 border border-primary-200 dark:border-primary-900/40 mb-4">
            <Shield className="w-7 h-7 text-primary-600 dark:text-primary-400" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white font-display tracking-tight">
            Instalacao do CRM
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Wizard guiado para provisionar Vercel, Supabase e admin inicial.
          </p>
        </div>

        <div className="bg-white dark:bg-dark-card border border-slate-200 dark:border-white/10 rounded-2xl p-8 shadow-xl backdrop-blur-sm space-y-6">
          {!meta && !metaError ? (
            <div className="flex items-center justify-center text-slate-600 dark:text-slate-300 py-8">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Carregando instalador...
            </div>
          ) : null}
          {metaError ? (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-900/20 p-3 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={16} className="mt-0.5" />
              <span>{metaError}</span>
            </div>
          ) : null}

          {meta && !meta.enabled ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-700 dark:text-amber-300 text-sm">
              <AlertCircle size={16} className="mt-0.5" />
              <span>Instalador desabilitado no servidor.</span>
            </div>
          ) : null}

          {meta?.enabled ? (
            <>
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {wizardSteps.map((step, index) => {
                    const isActive = index === currentStep;
                    const isDone = index < currentStep;
                    return (
                      <div
                        key={step.id}
                        className={`flex items-center gap-2 ${
                          isActive ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        <div
                          className={`h-7 w-7 rounded-full border flex items-center justify-center text-xs ${
                            isDone
                              ? 'bg-primary-600 text-white border-primary-600'
                              : isActive
                                ? 'bg-primary-600 text-white border-primary-600'
                                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-400'
                          }`}
                        >
                          {index + 1}
                        </div>
                        <span>{step.label}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="h-1 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-linear-to-r from-primary-500 to-primary-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {currentStep === 0 ? (
                <div className="border-t border-slate-200 dark:border-white/10 pt-5 space-y-4">
                  {meta.requiresToken ? (
                    <div className="space-y-2">
                      <label className="text-sm text-slate-600 dark:text-slate-300">
                        Installer token
                      </label>
                      <input
                        value={installerToken}
                        onChange={(e) => setInstallerToken(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                        placeholder="Token interno (opcional)"
                      />
                    </div>
                  ) : null}

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2 bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">Projeto</span>
                      <span className="text-slate-900 dark:text-white font-medium">
                        {project?.name || '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">URL</span>
                      <span className="text-slate-700 dark:text-slate-200">
                        {project?.url || '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500 dark:text-slate-400">PAT</span>
                      <span className="text-slate-700 dark:text-slate-200">
                        {maskValue(vercelToken)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleResetProject}
                      className="inline-flex items-center gap-2 text-xs text-primary-600 dark:text-primary-400 hover:text-primary-500"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Trocar token/projeto
                    </button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-slate-600 dark:text-slate-300">
                      Envs alvo
                    </label>
                    <div className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={targets.production}
                          onChange={(e) =>
                            setTargets((prev) => ({ ...prev, production: e.target.checked }))
                          }
                          className="accent-primary-600"
                        />
                        Production
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={targets.preview}
                          onChange={(e) =>
                            setTargets((prev) => ({ ...prev, preview: e.target.checked }))
                          }
                          className="accent-primary-600"
                        />
                        Preview
                      </label>
                    </div>
                  </div>
                </div>
              ) : null}

              {currentStep === 1 ? (
                <div className="border-t border-slate-200 dark:border-white/10 pt-5 space-y-4">
                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900/50 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Preencher automaticamente (recomendado)
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Cole o <b>Supabase URL</b> e seu <b>PAT</b>. A gente busca automaticamente o
                      <code> anon/service key</code> e cria uma credencial temporária para o
                      <code> dbUrl</code> (migrations), deixando o setup praticamente “copiar/colar”.
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900/50 space-y-2">
                    <label className="flex items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
                      <span className="font-medium">Deploy Edge Functions (Management API)</span>
                      <input
                        type="checkbox"
                        checked={supabaseDeployEdgeFunctions}
                        onChange={(e) => setSupabaseDeployEdgeFunctions(e.target.checked)}
                        className="accent-primary-600"
                      />
                    </label>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Quando ligado, o instalador vai setar secrets e fazer deploy das Edge
                      Functions do repositório em <code>supabase/functions/*</code>.
                    </p>

                    <div className="pt-2 space-y-2">
                      <button
                        type="button"
                        onClick={loadEdgeFunctionsPreview}
                        disabled={edgeFunctionsPreviewLoading}
                        className="px-3 py-2 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        {edgeFunctionsPreviewLoading ? 'Verificando…' : 'Ver quais functions serão deployadas'}
                      </button>

                      {edgeFunctionsPreviewError ? (
                        <div className="flex items-start gap-2 text-amber-700 dark:text-amber-300 text-sm">
                          <AlertCircle className="w-4 h-4 mt-0.5" />
                          <span>{edgeFunctionsPreviewError}</span>
                        </div>
                      ) : null}

                      {edgeFunctionsPreview.length > 0 ? (
                        <div className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
                          {edgeFunctionsPreview.map((f) => (
                            <div key={f.slug} className="flex items-center justify-between gap-3">
                              <span className="font-mono">{f.slug}</span>
                              <span className="font-mono">
                                verify_jwt={String(f.verify_jwt)}
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-slate-600 dark:text-slate-300">
                      Project URL
                    </label>
                    <input
                      value={supabaseUrl}
                      onChange={(e) => setSupabaseUrl(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                      placeholder="https://xxxx.supabase.co"
                    />
                  </div>

                  {supabaseDeployEdgeFunctions ? (
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <label className="text-sm text-slate-600 dark:text-slate-300">
                          Supabase access token (PAT)
                        </label>
                        <input
                          type="password"
                          value={supabaseAccessToken}
                          onChange={(e) => setSupabaseAccessToken(e.target.value)}
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                          placeholder="sbp_..."
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Gere em{' '}
                          <a
                            href="https://supabase.com/dashboard/account/tokens"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline underline-offset-2"
                          >
                            supabase.com/dashboard/account/tokens
                          </a>
                          .
                        </p>
                      </div>

                      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-900/50 space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">
                            Como você quer configurar o Supabase?
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="supabase-mode"
                              checked={supabaseMode === 'existing'}
                              onChange={() => setSupabaseMode('existing')}
                              className="accent-primary-600"
                            />
                            Selecionar projeto existente (recomendado)
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="supabase-mode"
                              checked={supabaseMode === 'create'}
                              onChange={() => setSupabaseMode('create')}
                              className="accent-primary-600"
                            />
                            Criar projeto novo
                          </label>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Observação: contas free podem ter limite de projetos. Se o Supabase bloquear,
                          vamos mostrar o erro real aqui.
                        </p>
                      </div>

                      {supabaseMode === 'existing' ? (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={loadSupabaseProjects}
                              disabled={supabaseProjectsLoading || !supabaseAccessToken.trim()}
                              className="px-3 py-2 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              {supabaseProjectsLoading ? 'Buscando…' : 'Buscar meus projetos'}
                            </button>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              (usa o PAT)
                            </span>
                          </div>

                          {supabaseProjectsError ? (
                            <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-700 dark:text-amber-300 text-sm">
                              <AlertCircle size={16} className="mt-0.5" />
                              <span>{supabaseProjectsError}</span>
                            </div>
                          ) : null}

                          {!supabaseProjectsLoading &&
                          supabaseProjectsLoadedForPat === supabaseAccessToken.trim() &&
                          supabaseProjects.length === 0 ? (
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/30 p-3 text-sm text-slate-700 dark:text-slate-200 space-y-2">
                              <div className="font-semibold">Nenhum projeto encontrado nesse PAT.</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                Se você ainda não tem projeto, a melhor opção é criar um automaticamente.
                              </div>
                              <button
                                type="button"
                                onClick={async () => {
                                  setSupabaseMode('create');
                                  await loadSupabaseOrgs();
                                }}
                                className="px-3 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-500"
                              >
                                Criar projeto automaticamente
                              </button>
                            </div>
                          ) : null}

                          {supabaseProjects.length > 0 ? (
                            <div className="space-y-2">
                              <label className="text-sm text-slate-600 dark:text-slate-300">
                                Selecione um projeto
                              </label>
                              <select
                                value={supabaseSelectedProjectRef}
                                onChange={(e) => {
                                  const ref = e.target.value;
                                  setSupabaseSelectedProjectRef(ref);
                                  const selected = supabaseProjects.find((p) => p.ref === ref) || null;
                                  if (selected) {
                                    setSupabaseUrl(selected.supabaseUrl);
                                    setSupabaseProjectRefTouched(true);
                                    setSupabaseProjectRef(selected.ref);
                                    setSupabaseResolveError(null);
                                  }
                                }}
                                className="w-full bg-white dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                              >
                                <option value="">Selecione…</option>
                                {supabaseProjects.map((p) => (
                                  <option key={p.ref} value={p.ref}>
                                    {p.name} — {p.ref}{p.status ? ` (${p.status})` : ''}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={loadSupabaseOrgs}
                              disabled={supabaseOrgsLoading || !supabaseAccessToken.trim()}
                              className="px-3 py-2 rounded-lg text-sm font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
                            >
                              {supabaseOrgsLoading ? 'Buscando…' : 'Buscar minhas orgs'}
                            </button>
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              (necessário para criar projeto)
                            </span>
                          </div>

                          {supabaseOrgsError ? (
                            <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-700 dark:text-amber-300 text-sm">
                              <AlertCircle size={16} className="mt-0.5" />
                              <span>{supabaseOrgsError}</span>
                            </div>
                          ) : null}

                          <div className="space-y-2">
                            <label className="text-sm text-slate-600 dark:text-slate-300">
                              Organization
                            </label>
                            <select
                              value={supabaseCreateOrgSlug}
                              onChange={(e) => setSupabaseCreateOrgSlug(e.target.value)}
                              className="w-full bg-white dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                            >
                              <option value="">Selecione…</option>
                              {supabaseOrgs.map((o) => (
                                <option key={o.slug} value={o.slug}>
                                  {o.name} — {o.slug}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm text-slate-600 dark:text-slate-300">
                              Nome do projeto
                            </label>
                            <input
                              value={supabaseCreateName}
                              onChange={(e) => setSupabaseCreateName(e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                              placeholder="ex: crmia-aluno"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm text-slate-600 dark:text-slate-300">
                              Senha do banco (db_pass)
                            </label>
                            <input
                              type="password"
                              value={supabaseCreateDbPass}
                              onChange={(e) => setSupabaseCreateDbPass(e.target.value)}
                              className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                              placeholder="mínimo 12 caracteres"
                            />
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Guarde essa senha. Ela é sua credencial do Postgres.
                            </p>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm text-slate-600 dark:text-slate-300">
                              Região (smart group)
                            </label>
                            <select
                              value={supabaseCreateRegion}
                              onChange={(e) =>
                                setSupabaseCreateRegion(e.target.value as 'americas' | 'emea' | 'apac')
                              }
                              className="w-full bg-white dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                            >
                              <option value="americas">Americas</option>
                              <option value="emea">EMEA</option>
                              <option value="apac">APAC</option>
                            </select>
                          </div>

                          <button
                            type="button"
                            onClick={createSupabaseProject}
                            disabled={
                              supabaseCreating ||
                              !supabaseAccessToken.trim() ||
                              !supabaseCreateOrgSlug.trim() ||
                              !supabaseCreateName.trim() ||
                              supabaseCreateDbPass.length < 12
                            }
                            className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-500/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 active:scale-[0.98]"
                          >
                            {supabaseCreating ? (
                              <>
                                <Loader2 className="animate-spin h-5 w-5 mr-2" />
                                Criando…
                              </>
                            ) : (
                              'Criar projeto e preencher automaticamente'
                            )}
                          </button>

                          {supabaseCreateError ? (
                            <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-700 dark:text-amber-300 text-sm">
                              <AlertCircle size={16} className="mt-0.5" />
                              <span>{supabaseCreateError}</span>
                            </div>
                          ) : null}
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="text-sm text-slate-600 dark:text-slate-300">
                          Project ref (opcional)
                        </label>
                        <input
                          value={supabaseProjectRef}
                          onChange={(e) => {
                            setSupabaseProjectRefTouched(true);
                            setSupabaseProjectRef(e.target.value);
                          }}
                          className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                          placeholder="ex: abcdefghijklmnopqrst"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Se vazio, o instalador tenta inferir do host de{' '}
                          <code>supabase.url</code> (ex: <code>https://&lt;ref&gt;.supabase.co</code>).
                        </p>
                        {!supabaseProjectRefTouched && supabaseUrl.trim() ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Inferido do URL:{' '}
                            <span className="font-mono">
                              {inferProjectRefFromSupabaseUrl(supabaseUrl.trim()) || '—'}
                            </span>
                          </p>
                        ) : null}
                      </div>

                      <button
                        type="button"
                        onClick={resolveSupabase}
                        disabled={
                          supabaseResolvedOk ||
                          supabaseResolving ||
                          !supabaseUrl.trim() ||
                          !supabaseAccessToken.trim()
                        }
                        className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-500/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 active:scale-[0.98]"
                      >
                        {supabaseResolving ? (
                          <>
                            <Loader2 className="animate-spin h-5 w-5 mr-2" />
                            Preenchendo...
                          </>
                        ) : supabaseResolvedOk ? (
                          supabaseResolvedLabel || 'OK — resolvido'
                        ) : (
                          'Preencher automaticamente'
                        )}
                      </button>

                      {supabaseResolvedOk ? (
                        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-emerald-700 dark:text-emerald-300 text-sm">
                          <CheckCircle2 size={16} className="mt-0.5" />
                          <span>
                            {supabaseResolvedLabel || 'Chaves e DB resolvidos automaticamente.'}
                          </span>
                        </div>
                      ) : null}

                      {supabaseResolveError ? (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-900/20 p-3 text-amber-700 dark:text-amber-300 text-sm">
                          <AlertCircle size={16} className="mt-0.5" />
                          <span>{supabaseResolveError}</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setSupabaseAdvanced((v) => !v)}
                      className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-500 underline underline-offset-2"
                    >
                      {supabaseAdvanced ? 'Ocultar campos avançados' : 'Mostrar campos avançados'}
                    </button>
                  </div>

                  {supabaseAdvanced ? (
                    <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm text-slate-600 dark:text-slate-300">
                      Anon key
                    </label>
                    <input
                          type="password"
                      value={supabaseAnonKey}
                      onChange={(e) => setSupabaseAnonKey(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                          placeholder="(auto)"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-slate-600 dark:text-slate-300">
                      Service role key
                    </label>
                    <input
                          type="password"
                      value={supabaseServiceKey}
                      onChange={(e) => setSupabaseServiceKey(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                          placeholder="(auto)"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-slate-600 dark:text-slate-300">
                      DB connection string
                    </label>
                    <input
                          type="password"
                      value={supabaseDbUrl}
                      onChange={(e) => setSupabaseDbUrl(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                          placeholder="(auto)"
                    />
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                          Só use se o auto-preenchimento falhar. (Settings &gt; Database)
                    </p>
                  </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {currentStep === 2 ? (
                <div className="border-t border-slate-200 dark:border-white/10 pt-5 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm text-slate-600 dark:text-slate-300">
                      Nome da empresa
                    </label>
                    <input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                      placeholder="Acme Corp"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-slate-600 dark:text-slate-300">
                      Email do admin
                    </label>
                    <input
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                      placeholder="admin@empresa.com"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <label className="text-sm text-slate-600 dark:text-slate-300">
                        Senha
                      </label>
                      <input
                        type="password"
                        value={adminPassword}
                        onChange={(e) => setAdminPassword(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                        placeholder="Min 6 caracteres"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm text-slate-600 dark:text-slate-300">
                        Confirmar senha
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-3 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
                        placeholder="Repita a senha"
                      />
                    </div>
                  </div>

                  {!passwordValid && adminPassword.length > 0 ? (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      Senha deve ter no minimo 6 caracteres.
                    </p>
                  ) : null}
                  {adminPassword.length > 0 && !passwordsMatch ? (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      Senhas nao conferem.
                    </p>
                  ) : null}
                </div>
              ) : null}

              {currentStep === 3 ? (
                <div className="border-t border-slate-200 dark:border-white/10 pt-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2 bg-slate-50 dark:bg-slate-900/50">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Vercel
                      </h3>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Projeto: {project?.name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        URL: {project?.url}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        PAT: {maskValue(vercelToken)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Envs: {selectedTargets.join(', ')}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2 bg-slate-50 dark:bg-slate-900/50">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Supabase
                      </h3>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        URL: {supabaseUrl}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Anon: {maskValue(supabaseAnonKey)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Service: {maskValue(supabaseServiceKey)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        DB: {maskValue(supabaseDbUrl, 12, 10)}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        Edge Functions:{' '}
                        {supabaseDeployEdgeFunctions ? 'deploy via Management API' : 'skip'}
                      </div>
                      {supabaseDeployEdgeFunctions ? (
                        <>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Project ref: {supabaseProjectRef ? supabaseProjectRef : '(inferir do URL)'}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            PAT: {maskValue(supabaseAccessToken)}
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2 bg-slate-50 dark:bg-slate-900/50">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Admin
                    </h3>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Empresa: {companyName}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Email: {adminEmail}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/50">
                    Esse passo vai configurar envs na Vercel, aplicar o schema no Supabase,
                    criar o admin inicial e disparar um redeploy.
                  </div>

                  <button
                    type="button"
                    onClick={runInstaller}
                    disabled={!canInstall || installing}
                    className="w-full flex justify-center items-center py-3 px-4 rounded-xl text-sm font-bold text-white bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-primary-500/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 active:scale-[0.98]"
                  >
                    {installing ? (
                      <>
                        <Loader2 className="animate-spin h-5 w-5 mr-2" />
                        Instalando...
                      </>
                    ) : (
                      'Instalar agora'
                    )}
                  </button>

                  {runError ? (
                    <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-900/20 p-3 text-red-600 dark:text-red-400 text-sm">
                      <AlertCircle size={16} className="mt-0.5" />
                      <div className="space-y-1">
                        <span className="block">{runError}</span>
                        {shouldShowTokenHelp(runError) ? (
                          <span className="block text-xs text-red-500 dark:text-red-300">
                            Gere um novo token em{' '}
                            <a
                              href="https://vercel.com/account/tokens"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline underline-offset-2"
                            >
                              vercel.com/account/tokens
                            </a>
                            .
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {result ? (
                    <div className="space-y-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Resultado
                      </h3>
                      <div className="space-y-1">
                        {result.steps?.map((step) => (
                          <div key={step.id} className="flex items-center gap-2 text-sm">
                            <CheckCircle2
                              size={14}
                              className={statusColor(step.status)}
                            />
                            <span className="font-medium text-slate-700 dark:text-slate-300">
                              {step.id}
                            </span>
                            <span className={statusColor(step.status)}>
                              {step.status}
                            </span>
                            {step.message ? (
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {step.message}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                      {result.ok ? (
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">
                          Instalacao concluida. Aguarde o redeploy e faca login com o admin.
                        </p>
                      ) : null}
                      {redeployWarning ? (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Redeploy falhou via API. Dispare um redeploy manual no Vercel.
                        </p>
                      ) : null}
                      {result.ok ? (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          O instalador sera desativado automaticamente apos o deploy.
                        </p>
                      ) : null}

                      {result.functions && result.functions.length > 0 ? (
                        <div className="pt-2 space-y-2">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            Edge Functions
                          </h4>
                          <div className="space-y-1">
                            {result.functions.map((fn) => (
                              <div key={fn.slug} className="flex items-center gap-2 text-sm">
                                <CheckCircle2
                                  size={14}
                                  className={fn.ok ? statusColor('ok') : statusColor('error')}
                                />
                                <span className="font-medium text-slate-700 dark:text-slate-300">
                                  {fn.slug}
                                </span>
                                <span className={fn.ok ? statusColor('ok') : statusColor('error')}>
                                  {fn.ok ? 'ok' : 'error'}
                                </span>
                                {!fn.ok ? (
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    {fn.error}
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-white/10">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={currentStep === 0 || installing}
                  className="px-3 py-2 rounded-lg text-sm border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition-all disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 active:scale-[0.99]"
                >
                  Voltar
                </button>
                {currentStep < wizardSteps.length - 1 ? (
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={!stepReady[currentStep]}
                    className="px-3 py-2 rounded-lg text-sm font-semibold bg-primary-600 text-white hover:bg-primary-500 transition-all disabled:opacity-50 shadow-lg shadow-primary-500/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 active:scale-[0.98]"
                  >
                    Avancar
                  </button>
                ) : (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {canInstall ? 'Pronto para instalar.' : 'Revise os dados antes de instalar.'}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
