import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { ImageOff, Save, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { companySettingsService, type CompanySettings, type TypeActivite } from '../services/api';
import { getErrorMessage } from '@/utils/errors';
import { PageShell } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { QueryState } from '@/components/ui/query-state';
import { FormSkeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/loading';
import { FieldError, fieldErrorProps } from '@/components/ui/field-error';
import { RequiredMark } from '@/components/ui/required-mark';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  MODULES_AU_CHOIX,
  CATEGORIES_MODULES,
  descriptionParametresFinance,
  libelleParametresFinance,
} from '@/config/modules';
import { useModules } from '@/lib/ModulesContext';
import { PROFILS_ACTIVITE, differeDuProfil, modulesDuProfil, profilActivite } from '@/config/profilsActivite';

type TextKey = 'nom' | 'telephone' | 'email' | 'site_web' | 'nif' | 'rc' | 'ai' | 'cb';

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const INITIAL: CompanySettings = {
  id: 1,
  nom: '',
  adresse: '',
  telephone: '',
  email: '',
  site_web: '',
  nif: '',
  rc: '',
  ai: '',
  cb: '',
  devise: 'FCFA',
  logo_url: '/logo.png',
  taux_conversion: 1,
  modules_desactives: [],
  type_activite: 'general',
  ticket_message: null,
};

const TICKET_MESSAGE_MAX = 300;

export default function CompanySettingsPage() {
  const { rafraichir: rafraichirModules } = useModules();
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [settings, setSettings] = useState<CompanySettings>(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<'nom' | 'email' | 'devise', string>>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await companySettingsService.get(true);
      setSettings({ ...INITIAL, ...data });
      setDirty(false);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Avertir en cas de modifications non enregistrées (fermeture ou rechargement de l'onglet).
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const updateSettings = (patch: Partial<CompanySettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_LOGO_BYTES) {
      toast.error('L’image dépasse 2 Mo : choisissez un fichier plus léger.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') updateSettings({ logo_url: event.target.result });
    };
    reader.onerror = () => toast.error('Impossible de lire cette image. Choisissez un autre fichier.');
    reader.readAsDataURL(file);
  };

  const removeLogo = async () => {
    if (
      !(await confirm({
        title: 'Retirer le logo ?',
        description: 'Le logo disparaîtra des documents imprimés et du menu dès l’enregistrement des paramètres.',
        confirmLabel: 'Retirer le logo',
        destructive: true,
      }))
    )
      return;
    updateSettings({ logo_url: '' });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!settings.nom?.trim()) next.nom = 'Saisissez le nom de l’entreprise.';
    if (settings.email?.trim() && !EMAIL_RE.test(settings.email.trim())) {
      next.email = 'Saisissez une adresse e-mail valide (ex. : contact@entreprise.ci).';
    }
    if (!settings.devise?.trim()) next.devise = 'Saisissez le libellé de la devise, par exemple FCFA.';
    setErrors(next);
    const first = (['nom', 'email', 'devise'] as const).find((k) => next[k]);
    if (first) {
      requestAnimationFrame(() => document.getElementById(first)?.focus());
      return;
    }

    setSaving(true);
    try {
      const updated = await companySettingsService.update({
        ...settings,
        nom: settings.nom.trim(),
        devise: settings.devise.trim(),
      });
      setSettings({ ...INITIAL, ...updated });
      setDirty(false);
      // Le menu et les gardes de route lisent ce contexte : sans rafraîchissement,
      // un module réactivé resterait invisible jusqu'au prochain rechargement.
      await rafraichirModules();
      toast.success('Paramètres de l’entreprise enregistrés');
    } catch (err) {
      toast.error(getErrorMessage(err, 'Impossible d’enregistrer les paramètres. Réessayez.'));
    } finally {
      setSaving(false);
    }
  };

  /**
   * Préréglage du profil : remplace les modules masqués (enregistré avec le
   * reste). Les modules hors périmètre v1 gardent leur état — le préréglage ne
   * les réaffiche pas.
   */
  const appliquerProfil = () => {
    updateSettings({
      modules_desactives: modulesDuProfil(settings.type_activite, settings.modules_desactives || []),
    });
    toast.info(`Modules du profil « ${profilActivite(settings.type_activite).label} » cochés. Enregistrez pour les appliquer.`);
  };

  /** Bascule un module dans la liste d'exclusion enregistrée avec les paramètres. */
  const toggleModule = (key: string) => {
    const actuels = settings.modules_desactives || [];
    updateSettings({
      modules_desactives: actuels.includes(key) ? actuels.filter((k) => k !== key) : [...actuels, key],
    });
  };

  const field = (
    label: string,
    key: TextKey,
    options: { placeholder?: string; type?: string; inputMode?: 'tel' | 'email' | 'url'; autoComplete?: string; required?: boolean; help?: string } = {}
  ) => {
    const error = key === 'nom' || key === 'email' ? errors[key] : undefined;
    const helpId = options.help ? `${key}-help` : undefined;
    const errProps = fieldErrorProps(key, error);
    return (
      <div className="space-y-1.5">
        <Label htmlFor={key}>
          {label}
          {options.required && <RequiredMark />}
        </Label>
        <Input
          id={key}
          type={options.type}
          inputMode={options.inputMode}
          autoComplete={options.autoComplete}
          value={settings[key] ?? ''}
          onChange={(e) => {
            updateSettings({ [key]: e.target.value });
            if (error) setErrors((p) => ({ ...p, [key]: undefined }));
          }}
          placeholder={options.placeholder}
          aria-invalid={errProps['aria-invalid']}
          aria-describedby={[helpId, errProps['aria-describedby']].filter(Boolean).join(' ') || undefined}
        />
        {options.help && (
          <p id={helpId} className="text-xs text-muted-foreground">
            {options.help}
          </p>
        )}
        <FieldError id={key}>{error}</FieldError>
      </div>
    );
  };

  const hasLogo = !!settings.logo_url;
  const paieActive = !(settings.modules_desactives || []).includes('paie');

  return (
    <PageShell
      title="Paramètres de l’entreprise"
      description="Identité imprimée sur vos documents, activité et modules affichés dans le menu"
      width="narrow"
    >
      <QueryState
        loading={loading}
        error={error}
        onRetry={() => void loadSettings()}
        errorTitle="Impossible de charger les paramètres de l’entreprise"
        skeleton={<FormSkeleton fields={6} />}
      >
        {/* La barre d’enregistrement collée en bas masquait le champ qui reçoit le focus
            (WCAG 2.4.11, A11Y-G02) : chaque contrôle garde sous lui la hauteur de la barre
            (deux lignes sur téléphone) quand le navigateur le fait défiler. */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-4 sm:space-y-6 [&_a]:scroll-mb-28 [&_button]:scroll-mb-28 [&_input]:scroll-mb-28 [&_textarea]:scroll-mb-28"
        >
          <Card>
            <CardHeader>
              <CardTitle>Identité de l’entreprise</CardTitle>
              <CardDescription>Nom et coordonnées imprimés en tête de vos factures, devis et bons de livraison</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {field('Nom de l’entreprise', 'nom', { placeholder: 'Ex. : Boutique Plateau', autoComplete: 'organization', required: true })}
              <div className="space-y-1.5">
                <Label htmlFor="adresse">Adresse</Label>
                <Textarea
                  id="adresse"
                  value={settings.adresse ?? ''}
                  onChange={(e) => updateSettings({ adresse: e.target.value })}
                  placeholder="Ex. : Rue du Commerce, Plateau, Abidjan"
                  rows={3}
                  autoComplete="street-address"
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {field('Téléphone', 'telephone', { placeholder: 'Ex. : +225 07 00 00 00 00', type: 'tel', inputMode: 'tel', autoComplete: 'tel' })}
                {field('Adresse e-mail', 'email', {
                  placeholder: 'Ex. : contact@entreprise.ci',
                  type: 'email',
                  inputMode: 'email',
                  autoComplete: 'email',
                })}
              </div>
              {field('Site web', 'site_web', { placeholder: 'Ex. : www.entreprise.ci', inputMode: 'url', autoComplete: 'url' })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Identifiants fiscaux et bancaires</CardTitle>
              <CardDescription>Repris en pied de page de vos documents</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {field('NIF', 'nif')}
              {field('RCCM', 'rc')}
              {field('AI', 'ai')}
              {field('Compte bancaire', 'cb')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>Devise et logo imprimés sur vos documents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-1.5 sm:max-w-xs">
                <Label htmlFor="devise">
                  Devise <RequiredMark />
                </Label>
                <Input
                  id="devise"
                  value={settings.devise}
                  onChange={(e) => {
                    updateSettings({ devise: e.target.value });
                    if (errors.devise) setErrors((p) => ({ ...p, devise: undefined }));
                  }}
                  placeholder="FCFA"
                  maxLength={10}
                  aria-invalid={errors.devise ? true : undefined}
                  aria-describedby={errors.devise ? 'devise-help devise-error' : 'devise-help'}
                />
                <p id="devise-help" className="text-xs text-muted-foreground">
                  Libellé imprimé après les montants sur vos documents. Utilisez «&nbsp;FCFA&nbsp;».
                </p>
                <FieldError id="devise">{errors.devise}</FieldError>
              </div>

              <div className="space-y-1.5 border-t pt-4">
                <Label htmlFor="ticket_message">Message du ticket de caisse</Label>
                <Textarea
                  id="ticket_message"
                  value={settings.ticket_message ?? ''}
                  onChange={(e) => updateSettings({ ticket_message: e.target.value })}
                  placeholder="Ex. : Merci de votre visite. Échange sous 7 jours avec ce ticket."
                  rows={2}
                  maxLength={TICKET_MESSAGE_MAX}
                  aria-describedby="ticket_message-help"
                />
                <p id="ticket_message-help" className="text-xs text-muted-foreground">
                  Imprimé en bas du ticket 80 mm de la vente comptoir. {(settings.ticket_message ?? '').length}/
                  {TICKET_MESSAGE_MAX} caractères
                </p>
              </div>

              <div className="space-y-2 border-t pt-4">
                <p className="text-sm font-medium" id="logo-label">
                  Logo de l’entreprise
                </p>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  {/* Rayons concentriques : cadre rounded-xl (12 px) − marge p-1 (4 px) = image rounded-lg (8 px). */}
                  <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl border bg-muted p-1">
                    {hasLogo ? (
                      <img
                        src={settings.logo_url ?? ''}
                        alt="Aperçu du logo"
                        className="h-full w-full rounded-lg object-contain outline outline-1 -outline-offset-1 outline-[hsl(var(--foreground)/0.08)]"
                      />
                    ) : (
                      <span className="flex flex-col items-center gap-1 text-center text-xs text-muted-foreground">
                        <ImageOff className="h-5 w-5" aria-hidden="true" />
                        Aucun logo
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    <input
                      ref={fileInput}
                      type="file"
                      id="logo-upload"
                      accept="image/png,image/jpeg,image/gif"
                      onChange={handleLogoChange}
                      className="hidden"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="gap-2"
                        onClick={() => fileInput.current?.click()}
                        aria-describedby="logo-help"
                      >
                        <Upload className="h-4 w-4" aria-hidden="true" />
                        {hasLogo ? 'Remplacer le logo' : 'Choisir une image'}
                      </Button>
                      {hasLogo && (
                        <Button type="button" variant="ghost" className="gap-2" onClick={() => void removeLogo()}>
                          <Trash2 className="h-4 w-4" aria-hidden="true" /> Retirer le logo
                        </Button>
                      )}
                    </div>
                    <p id="logo-help" className="text-xs text-muted-foreground">
                      PNG, JPG ou GIF, 2 Mo au maximum
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Activité</CardTitle>
              <CardDescription>
                Votre métier propose les modules utiles et l’écran de vente à ouvrir en premier. Il ne modifie aucune
                donnée.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <fieldset>
                <legend className="sr-only">Type d’activité</legend>
                <div className="grid gap-x-2 gap-y-1 sm:grid-cols-2">
                  {PROFILS_ACTIVITE.map((p) => (
                    <label
                      key={p.value}
                      htmlFor={`activite-${p.value}`}
                      className="flex cursor-pointer items-start gap-3 rounded-md p-2 hover:bg-accent"
                    >
                      <input
                        type="radio"
                        id={`activite-${p.value}`}
                        name="type_activite"
                        value={p.value}
                        checked={settings.type_activite === p.value}
                        onChange={() => updateSettings({ type_activite: p.value as TypeActivite })}
                        aria-describedby={`activite-${p.value}-desc`}
                        className="mt-1 h-4 w-4 shrink-0 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{p.label}</span>
                        <span id={`activite-${p.value}-desc`} className="block text-xs text-muted-foreground">
                          {p.description}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {differeDuProfil(settings.type_activite, settings.modules_desactives || []) && (
                <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Les modules cochés plus bas ne suivent pas le préréglage de ce profil
                  </p>
                  <Button type="button" variant="outline" size="sm" onClick={appliquerProfil}>
                    Appliquer les modules du profil
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Modules du programme</CardTitle>
              <CardDescription>
                Décochez ce que vous n’utilisez pas : ces écrans disparaissent du menu. Les données déjà enregistrées ne
                sont pas supprimées et réapparaissent si vous réactivez le module.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {CATEGORIES_MODULES.map((categorie) => {
                // Les modules hors périmètre v1 (paie, employés, comptabilité,
                // trésorerie) ne sont pas « au choix du client » : pas de case.
                const modules = MODULES_AU_CHOIX.filter((m) => m.categorie === categorie);
                if (modules.length === 0) return null;
                return (
                  <fieldset key={categorie}>
                    <legend className="mb-2 text-sm font-medium">{categorie}</legend>
                    {/* Lignes sans cadre : 28 cases encadrées faisaient 28 cartes. */}
                    <div className="grid gap-x-2 gap-y-1 sm:grid-cols-2">
                      {modules.map((m) => {
                        const actif = !(settings.modules_desactives || []).includes(m.key);
                        return (
                          <label
                            key={m.key}
                            htmlFor={`module-${m.key}`}
                            className={`flex items-start gap-3 rounded-md p-2 ${
                              m.verrouille ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-accent'
                            }`}
                          >
                            <Checkbox
                              id={`module-${m.key}`}
                              checked={actif}
                              disabled={m.verrouille}
                              onChange={() => toggleModule(m.key)}
                              aria-describedby={`module-${m.key}-desc`}
                              className="mt-0.5"
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium">
                                {m.key === 'parametres-finance' ? libelleParametresFinance(paieActive) : m.label}
                                {m.verrouille && (
                                  <span className="font-normal text-muted-foreground"> · toujours actif</span>
                                )}
                              </span>
                              <span id={`module-${m.key}-desc`} className="block text-xs text-muted-foreground">
                                {m.key === 'parametres-finance' ? descriptionParametresFinance(paieActive) : m.description}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </CardContent>
          </Card>

          {/* Barre d'enregistrement toujours visible : le bouton n'est plus à 3 000 px du premier champ. */}
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t bg-background px-4 py-3 sm:-mx-6 sm:px-6">
            <p role="status" className="text-sm text-muted-foreground">
              {dirty ? 'Modifications non enregistrées' : 'Tous les paramètres sont enregistrés'}
            </p>
            <Button type="submit" size="touch" disabled={saving} className="gap-2">
              {saving ? <Spinner /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {saving ? 'Enregistrement…' : 'Enregistrer les paramètres'}
            </Button>
          </div>
        </form>
      </QueryState>
    </PageShell>
  );
}
