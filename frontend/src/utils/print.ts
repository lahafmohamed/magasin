/**
 * Impression d'un document HTML autonome (ticket 80 mm, planche
 * d'étiquettes) par le navigateur : aucun logiciel à installer chez le client,
 * n'importe quelle imprimante installée sous Windows convient.
 */

/**
 * Imprime un document HTML dans un cadre caché : la page en cours ne bouge
 * pas et le focus revient au champ de scan. Résolu après l'ouverture de la
 * boîte d'impression ; rejeté si le navigateur bloque l'impression.
 */
export function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);

    const cleanup = () => window.setTimeout(() => frame.remove(), 1000);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) {
      frame.remove();
      reject(new Error('Impression indisponible dans ce navigateur.'));
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    const lancer = () => {
      try {
        win.focus();
        win.print();
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Impression impossible.'));
      } finally {
        cleanup();
      }
    };

    // Attendre le logo : imprimé avant son chargement, il sortirait vide.
    const images = Array.from(doc.images).filter((img) => !img.complete);
    if (images.length === 0) {
      window.setTimeout(lancer, 50);
      return;
    }
    let restantes = images.length;
    const fin = () => {
      restantes -= 1;
      if (restantes === 0) lancer();
    };
    for (const img of images) {
      img.addEventListener('load', fin, { once: true });
      img.addEventListener('error', fin, { once: true });
    }
    // Filet : une image qui ne répond jamais ne bloque pas le ticket.
    window.setTimeout(() => {
      if (restantes > 0) {
        restantes = 0;
        lancer();
      }
    }, 2000);
  });
}
