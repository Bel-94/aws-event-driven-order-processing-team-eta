export type ProductCategory =
  | 'Vegetables'
  | 'Fruit'
  | 'Bakery'
  | 'Dairy'
  | 'Drinks'
  | 'Household'
  | 'Frozen Foods';

export type Availability = 'In stock' | 'Low stock' | 'Out of stock';

export interface Product {
  id: string;
  name: string;
  slug: string;
  category: ProductCategory;
  price: number;
  currency: string;
  weight: string;
  rating: number;
  reviewCount: number;
  availability: Availability;
  imageUrl: string;
  description: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type PaymentMethod = 'card' | 'mpesa' | 'cod';

export type OrderLifecycleStatus = 'Pending' | 'Processing' | 'Completed' | 'Cancelled';

export type TimelineStepStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface TimelineStep {
  id: string;
  title: string;
  description: string;
  status: TimelineStepStatus;
  timestamp?: string;
  service?: string;
}

export interface CheckoutPayload {
  customerId: string;
  customerEmail?: string;
  deliveryAddress: string;
  phone: string;
  instructions?: string;
  paymentMethod: PaymentMethod;
  items: Array<{
    sku: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
  currency: string;
}

export interface OrderRecord {
  orderId: string;
  status: OrderLifecycleStatus;
  totalAmount: number;
  currency: string;
  createdAt: string;
  estimatedDelivery: string;
  paymentStatus?: string;
  inventoryStatus?: string;
  notificationStatus?: string;
  eventPublished?: boolean;
  items: Array<{
    sku: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
  timeline: TimelineStep[];
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  addresses: string[];
}

export interface AuthSession {
  accessToken: string;
  idToken: string;
  expiresAt: number;
  user: UserProfile;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  body?: string;
}

export interface AdminMetrics {
  todaysOrders: number;
  pendingOrders: number;
  revenue: number;
  inventoryAlerts: number;
  statusDistribution: Array<{ label: string; value: number; color: string }>;
  recentOrders: OrderRecord[];
  revenueByDay: Array<{ day: string; amount: number }>;
}
