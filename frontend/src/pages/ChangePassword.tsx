import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { authService } from '../services/authService';
import { toast } from 'sonner';

export default function ChangePassword() {
  const { logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      toast.error('Le nouveau mot de passe doit avoir au moins 6 caractères.');
      return;
    }
    if (newPassword !== confirm) {
      toast.error('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      await authService.changePassword(currentPassword, newPassword);
      toast.success('Mot de passe mis à jour. Veuillez vous reconnecter.');
      logout();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Erreur lors du changement de mot de passe.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-base-200">
      <div className="card w-full max-w-md bg-base-100 shadow-xl">
        <div className="card-body">
          <h2 className="card-title text-2xl font-bold mb-1">Changement de mot de passe requis</h2>
          <p className="text-base-content/60 text-sm mb-4">
            Pour des raisons de sécurité, vous devez définir un nouveau mot de passe avant de continuer.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="form-control">
              <label className="label"><span className="label-text">Mot de passe actuel</span></label>
              <input
                type="password"
                className="input input-bordered"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="form-control">
              <label className="label"><span className="label-text">Nouveau mot de passe</span></label>
              <input
                type="password"
                className="input input-bordered"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            <div className="form-control">
              <label className="label"><span className="label-text">Confirmer le nouveau mot de passe</span></label>
              <input
                type="password"
                className="input input-bordered"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={loading}>
              {loading ? <span className="loading loading-spinner loading-sm" /> : 'Changer le mot de passe'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
