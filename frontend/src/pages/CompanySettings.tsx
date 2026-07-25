import { useState, useEffect } from 'react';
import { Loader2, Save, Building2 } from 'lucide-react';
import { companySettingsService, CompanySettings } from '../services/api';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function CompanySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [settings, setSettings] = useState<CompanySettings>({
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
  });

  useEffect(() => {
    loadSettings();
  }, []);

  // Avertir l'utilisateur en cas de modifications non enregistrées
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  // Met à jour les paramètres et marque le formulaire comme modifié
  const updateSettings = (patch: Partial<CompanySettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Le fichier est trop volumineux (max 2 Mo)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        updateSettings({ logo_url: event.target.result as string });
      }
    };
    reader.onerror = () => {
      toast.error('Erreur lors de la lecture du fichier');
    };
    reader.readAsDataURL(file);
  };

  const loadSettings = async () => {
    try {
      const data = await companySettingsService.get();
      setSettings(data);
      setDirty(false);
    } catch {
      toast.error('Erreur lors du chargement des paramètres');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await companySettingsService.update(settings);
      setSettings(updated);
      setDirty(false);
      toast.success('Paramètres mis à jour avec succès');
    } catch {
      toast.error('Erreur lors de la mise à jour');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const field = (label: string, key: keyof CompanySettings, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={settings[key] ?? ''}
        onChange={(e) => updateSettings({ [key]: e.target.value })}
        placeholder={placeholder}
      />
    </div>
  );

  return (
    <div className="p-3 sm:p-6 w-full max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Building2 className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Paramètres de l'entreprise</h1>
          <p className="text-muted-foreground mt-1">Personnalisez les informations affichées sur les documents</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Informations générales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {field("Nom de l'entreprise", 'nom', 'Hitek-CI')}
            <div className="space-y-1.5">
              <Label htmlFor="adresse">Adresse</Label>
              <textarea
                id="adresse"
                value={settings.adresse ?? ''}
                onChange={(e) => updateSettings({ adresse: e.target.value })}
                placeholder="Adresse complète"
                rows={3}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('Téléphone', 'telephone', '+225 07 00 00 00')}
              {field('Email', 'email', 'contact@example.com')}
            </div>
            {field('Site web', 'site_web', 'www.example.com')}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Identifiants fiscaux</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field('NIF', 'nif')}
            {field('RC', 'rc')}
            {field('AI', 'ai')}
            {field('Compte bancaire (CB)', 'cb')}
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Personnalisation des documents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="devise">Devise</Label>
                <Input
                  id="devise"
                  value={settings.devise}
                  onChange={(e) => updateSettings({ devise: e.target.value })}
                  placeholder="FCFA"
                />
                <p className="text-xs text-muted-foreground">Symbole affiché sur les PDF, impressions et relevés</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="taux_conversion">Taux de conversion (1 FCFA → devise)</Label>
                <Input
                  id="taux_conversion"
                  type="number"
                  step="0.0001"
                  min="0.0001"
                  value={settings.taux_conversion}
                  onChange={(e) => updateSettings({ taux_conversion: parseFloat(e.target.value) || 1 })}
                  placeholder="1.0000"
                />
                <p className="text-xs text-muted-foreground">Ex: 1 EUR = 655.957 FCFA → taux = 655.957</p>
              </div>
            </div>

            <div className="border-t pt-4 space-y-2">
              <p className="text-sm font-medium">Logo de l'entreprise</p>
              <div className="flex items-center gap-4">
                {settings.logo_url && settings.logo_url !== '' ? (
                  <div className="relative group w-24 h-24 rounded-lg border bg-muted flex items-center justify-center p-2 overflow-hidden">
                    <img
                      src={settings.logo_url}
                      alt="Logo Preview"
                      className="w-full h-full object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => updateSettings({ logo_url: '' })}
                      className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-semibold rounded-lg"
                    >
                      Supprimer
                    </button>
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-lg border-2 border-dashed bg-muted flex items-center justify-center text-muted-foreground text-xs">
                    Aucun logo
                  </div>
                )}
                <div className="flex-1">
                  <input
                    type="file"
                    id="logo-upload"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById('logo-upload')?.click()}
                  >
                    Choisir une image
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Format PNG, JPG ou GIF. Taille max 2 Mo.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="submit" disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </div>
  );
}