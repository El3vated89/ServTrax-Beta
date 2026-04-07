import { RouteStop, BaseCamp } from '../modules/routes/types';

/**
 * RouteOptimizationService
 * 
 * Handles the logic for sorting and optimizing route stops.
 * This is abstracted so that future upgrades can use real mapping APIs
 * (like Google Maps Distance Matrix) without changing the UI components.
 */
export const routeOptimizationService = {
  /**
   * Simple distance-based sort (Euclidean distance for MVP)
   * In a real app, this would use road distance from a mapping API.
   */
  sortByDistance: (stops: RouteStop[], baseCamp: BaseCamp, mode: 'close_to_far' | 'far_to_close'): RouteStop[] => {
    const sorted = [...stops].sort((a, b) => {
      const distA = Math.sqrt(
        Math.pow(a.lat_snapshot - baseCamp.lat, 2) + 
        Math.pow(a.lng_snapshot - baseCamp.lng, 2)
      );
      const distB = Math.sqrt(
        Math.pow(b.lat_snapshot - baseCamp.lat, 2) + 
        Math.pow(b.lng_snapshot - baseCamp.lng, 2)
      );
      
      return mode === 'close_to_far' ? distA - distB : distB - distA;
    });
    
    return sorted;
  },

  /**
   * Simple "Nearest Neighbor" optimization for MVP.
   * Starts from base camp, finds closest stop, then closest to that, etc.
   * Optionally returns to base camp.
   */
  optimizeRoute: (stops: RouteStop[], baseCamp: BaseCamp, returnToBase: boolean): RouteStop[] => {
    if (stops.length === 0) return [];
    
    const unvisited = [...stops];
    const optimized: RouteStop[] = [];
    let currentLat = baseCamp.lat;
    let currentLng = baseCamp.lng;

    while (unvisited.length > 0) {
      let closestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const stop = unvisited[i];
        const dist = Math.sqrt(
          Math.pow(stop.lat_snapshot - currentLat, 2) + 
          Math.pow(stop.lng_snapshot - currentLng, 2)
        );
        
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = i;
        }
      }

      const nextStop = unvisited.splice(closestIdx, 1)[0];
      optimized.push(nextStop);
      currentLat = nextStop.lat_snapshot;
      currentLng = nextStop.lng_snapshot;
    }

    return optimized;
  },

  /**
   * Group stops by city
   */
  groupByCity: (stops: RouteStop[]): Record<string, RouteStop[]> => {
    return stops.reduce((acc, stop) => {
      const city = stop.city_snapshot || 'Unknown';
      if (!acc[city]) acc[city] = [];
      acc[city].push(stop);
      return acc;
    }, {} as Record<string, RouteStop[]>);
  },

  /**
   * Calculate due status based on date
   */
  getDueState: (scheduledDate: any, dueDate: any, status: string): 'upcoming' | 'due' | 'overdue' | 'completed' => {
    if (status === 'completed') return 'completed';
    
    const now = new Date();
    const scheduled = scheduledDate instanceof Date ? scheduledDate : new Date(scheduledDate?.seconds * 1000 || scheduledDate);
    const due = dueDate instanceof Date ? dueDate : new Date(dueDate?.seconds * 1000 || dueDate);

    if (now > due) return 'overdue';
    
    // If scheduled for today
    if (now.toDateString() === scheduled.toDateString()) return 'due';
    
    return 'upcoming';
  }
};
