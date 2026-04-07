export interface FeatureFlags {
  routes_basic: boolean;
  routes_optimization: boolean;
  routes_city_grouping: boolean;
  routes_advanced_sorting: boolean;
  routes_live_tracking_future: boolean;
}

export const featureFlagService = {
  getFlags: (): FeatureFlags => {
    // In a real app, this would fetch from a remote config or database
    return {
      routes_basic: true,
      routes_optimization: true,
      routes_city_grouping: true,
      routes_advanced_sorting: true,
      routes_live_tracking_future: false,
    };
  }
};
