import { Badge } from './badge';
import { cn } from "@/lib/utils";

// Standardized status colors for ERP
export const statusColors = {
  // Payment statuses
  paid: 'bg-green-100 text-green-800 border-green-200',
  unpaid: 'bg-red-100 text-red-800 border-red-200',
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  partial: 'bg-blue-100 text-blue-800 border-blue-200',
  overdue: 'bg-red-100 text-red-800 border-red-200',
  
  // Stock statuses
  in_stock: 'bg-green-100 text-green-800 border-green-200',
  low_stock: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  out_of_stock: 'bg-red-100 text-red-800 border-red-200',
  
  // Order statuses
  draft: 'bg-gray-100 text-gray-800 border-gray-200',
  confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
  processing: 'bg-purple-100 text-purple-800 border-purple-200',
  shipped: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  delivered: 'bg-green-100 text-green-800 border-green-200',
  cancelled: 'bg-red-100 text-red-800 border-red-200',
  
  // General statuses
  active: 'bg-green-100 text-green-800 border-green-200',
  inactive: 'bg-gray-100 text-gray-800 border-gray-200',
  archived: 'bg-slate-100 text-slate-800 border-slate-200',
  
  // Priority levels
  low: 'bg-gray-100 text-gray-800 border-gray-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  critical: 'bg-red-100 text-red-800 border-red-200',
} as const;

export type StatusType = keyof typeof statusColors;

interface StatusBadgeProps {
  status: StatusType | string;
  children: React.ReactNode;
  variant?: 'default' | 'outline' | 'secondary';
  className?: string;
}

export function StatusBadge({ status, children, variant = 'default', className }: StatusBadgeProps) {
  const colorClass = statusColors[status as StatusType] || statusColors.draft;
  
  return (
    <Badge 
      variant={variant} 
      className={cn(
        colorClass,
        variant === 'default' && 'border',
        className
      )}
    >
      {children}
    </Badge>
  );
}

// Specific status badge components for common use cases
export function PaymentStatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, StatusType> = {
    'payée': 'paid',
    'payé': 'paid',
    'impayée': 'unpaid',
    'impayé': 'unpaid',
    'en_attente': 'pending',
    'en attente': 'pending',
    'partielle': 'partial',
    'partiel': 'partial',
    'en_retard': 'overdue',
    'en retard': 'overdue',
  };

  const normalizedStatus = statusMap[status.toLowerCase()] || 'pending';
  
  return (
    <StatusBadge status={normalizedStatus}>
      {status}
    </StatusBadge>
  );
}

export function StockStatusBadge({ stock, stockMin }: { stock: number; stockMin: number }) {
  let status: StatusType;
  let label: string;

  if (stock <= 0) {
    status = 'out_of_stock';
    label = 'Rupture';
  } else if (stock <= stockMin) {
    status = 'low_stock';
    label = 'Stock faible';
  } else {
    status = 'in_stock';
    label = 'En stock';
  }

  return (
    <StatusBadge status={status}>
      {label} ({stock})
    </StatusBadge>
  );
}

export function OrderStatusBadge({ status }: { status: string }) {
  const statusMap: Record<string, StatusType> = {
    'brouillon': 'draft',
    'confirmée': 'confirmed',
    'confirmé': 'confirmed',
    'en_traitement': 'processing',
    'en traitement': 'processing',
    'expédiée': 'shipped',
    'expédié': 'shipped',
    'livrée': 'delivered',
    'livré': 'delivered',
    'annulée': 'cancelled',
    'annulé': 'cancelled',
  };

  const normalizedStatus = statusMap[status.toLowerCase()] || 'draft';
  
  return (
    <StatusBadge status={normalizedStatus}>
      {status}
    </StatusBadge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const priorityMap: Record<string, StatusType> = {
    'basse': 'low',
    'bas': 'low',
    'moyenne': 'medium',
    'moyen': 'medium',
    'élevée': 'high',
    'élevé': 'high',
    'critique': 'critical',
  };

  const normalizedPriority = priorityMap[priority.toLowerCase()] || 'medium';
  
  return (
    <StatusBadge status={normalizedPriority}>
      {priority}
    </StatusBadge>
  );
}
