export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  /** position of the stop in the day route */
  index?: number;
  color?: string;
  title: string;
  subtitle?: string;
}
