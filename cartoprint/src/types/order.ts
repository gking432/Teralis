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

export type PrintReadinessStatus = 'ready' | 'needs-adjustment' | 'blocked';

export interface PrintReadinessReport {
  status: PrintReadinessStatus;
  warnings: string[];
  suggestions: string[];
}

export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PrintMetrics {
  frame: ScreenRect | null;
  safeFrame: ScreenRect | null;
  visibleLabelCount: number;
  safeLabelCount: number;
  edgeLabelCount: number;
  edgeLabelNames: string[];
  subjectCoverage: number | null;
  subjectTouchesSafeMargin: boolean;
}

export type PrintRegionScope = 'country' | 'state' | 'county' | 'city';

export interface PrintVisibleRegion {
  id: string;
  name: string;
  scope: PrintRegionScope;
  fullName?: string;
}

export interface PrintSelectedRegion extends PrintVisibleRegion {
  geojson: GeoJSON.Geometry | null;
  bbox?: [string, string, string, string] | null;
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
