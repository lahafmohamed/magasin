import { Button } from './button';
import { Printer } from 'lucide-react';

interface PrintLayoutProps {
  title: string;
  children: React.ReactNode;
  onPrint?: () => void;
}

export function PrintLayout({ title: _title, children, onPrint }: PrintLayoutProps) {
  const handlePrint = () => {
    if (onPrint) {
      onPrint();
    } else {
      window.print();
    }
  };

  return (
    <div className="space-y-4">
      {/* Print button - hidden when printing */}
      <div className="print:hidden">
        <Button onClick={handlePrint} className="gap-2">
          <Printer className="h-4 w-4" />
          Imprimer
        </Button>
      </div>

      {/* Print content */}
      <div className="print:shadow-none print:border-none">
        {children}
      </div>
    </div>
  );
}

interface InvoicePrintProps {
  invoice: any;
  client: any;
  lignes: any[];
  company?: {
    name: string;
    address: string;
    phone: string;
    email: string;
  };
}

export function InvoicePrint({ invoice, client, lignes, company }: InvoicePrintProps) {
  const subtotal = lignes.reduce((sum, ligne) => sum + (ligne.quantite * ligne.prix_unitaire), 0);
  const tax = subtotal * 0.18; // 18% TVA
  const total = subtotal + tax;

  return (
    <PrintLayout title={`Facture ${invoice.numero_facture}`}>
      <div className="max-w-4xl mx-auto bg-white p-8 print:p-6 print:max-w-none">
        {/* Header */}
        <div className="border-b-2 border-gray-900 pb-4 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">FACTURE</h1>
              <p className="text-lg font-semibold text-gray-700 mt-1">
                N° {invoice.numero_facture}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-600">Date:</p>
              <p className="font-semibold">
                {new Date(invoice.date_facture).toLocaleDateString('fr-FR')}
              </p>
              <p className="text-sm text-gray-600 mt-2">Échéance:</p>
              <p className="font-semibold">
                {new Date(invoice.date_echeance).toLocaleDateString('fr-FR')}
              </p>
            </div>
          </div>
        </div>

        {/* Company and Client Info */}
        <div className="grid grid-cols-2 gap-8 mb-6">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">De:</h3>
            <div className="text-sm text-gray-700">
              <p className="font-semibold">{company?.name || 'Magasin Info'}</p>
              <p>{company?.address || 'Adresse de l\'entreprise'}</p>
              <p>Tél: {company?.phone || '+226 XX XX XX XX'}</p>
              <p>Email: {company?.email || 'contact@magasin.com'}</p>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 mb-2">Client:</h3>
            <div className="text-sm text-gray-700">
              <p className="font-semibold">
                {client?.nom} {client?.prenom}
              </p>
              <p>{client?.adresse || 'Adresse du client'}</p>
              <p>Tél: {client?.telephone || client?.email || 'Non spécifié'}</p>
            </div>
          </div>
        </div>

        {/* Items Table */}
        <div className="mb-6">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-900">
                <th className="text-left py-2 text-sm font-semibold">Description</th>
                <th className="text-center py-2 text-sm font-semibold">Quantité</th>
                <th className="text-right py-2 text-sm font-semibold">Prix Unit.</th>
                <th className="text-right py-2 text-sm font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((ligne, index) => (
                <tr key={index} className="border-b border-gray-300">
                  <td className="py-3 text-sm">
                    <div>
                      <p className="font-medium">{ligne.produit_nom}</p>
                      <p className="text-gray-600 text-xs">{ligne.produit_reference}</p>
                    </div>
                  </td>
                  <td className="text-center py-3 text-sm">{ligne.quantite}</td>
                  <td className="text-right py-3 text-sm">
                    {parseFloat(ligne.prix_unitaire).toFixed(2)} XOF
                  </td>
                  <td className="text-right py-3 text-sm font-medium">
                    {(ligne.quantite * parseFloat(ligne.prix_unitaire)).toFixed(2)} XOF
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end mb-6">
          <div className="w-64">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Sous-total:</span>
                <span>{subtotal.toFixed(2)} XOF</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>TVA (18%):</span>
                <span>{tax.toFixed(2)} XOF</span>
              </div>
              <div className="flex justify-between font-bold text-lg border-t-2 border-gray-900 pt-2">
                <span>Total:</span>
                <span>{total.toFixed(2)} XOF</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-300 pt-4 mt-8">
          <div className="text-center text-sm text-gray-600">
            <p>Merci pour votre confiance!</p>
            <p className="mt-2">Conditions de paiement: Paiement à réception</p>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page {
            margin: 1cm;
            size: A4;
          }
          
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          
          .print\\:hidden {
            display: none !important;
          }
          
          .print\\:p-6 {
            padding: 1.5rem !important;
          }
          
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          
          .print\\:border-none {
            border: none !important;
          }
          
          .print\\:max-w-none {
            max-width: none !important;
          }
        }
      `}</style>
    </PrintLayout>
  );
}
