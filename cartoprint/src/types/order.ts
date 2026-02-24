export type PrintSize = '12x16' | '18x24' | '24x36' | '30x40';
export type PaperType = 'matte' | 'lustre';
export type FrameType = 'none' | 'black' | 'white' | 'oak';

export interface PrintConfig {
  size: PrintSize;
  paper: PaperType;
  frame: FrameType;
}

export interface PriceBreakdown {
  base: number;
  paper: number;
  frame: number;
  total: number;
}

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'exporting'
  | 'submitted'
  | 'printing'
  | 'shipped'
  | 'delivered';

export interface Order {
  id: string;
  mapConfig: import('./map').MapConfig;
  printConfig: PrintConfig;
  price: PriceBreakdown;
  status: OrderStatus;
  stripeSessionId?: string;
  prodigiOrderId?: string;
  imageUrl?: string;
  shippingAddress?: ShippingAddress;
  createdAt: string;
  updatedAt: string;
}

export interface ShippingAddress {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}
