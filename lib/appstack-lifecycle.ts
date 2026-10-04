// Keep event sources separate: the same transaction can appear in multiple feeds.
export const lifecycleEvents = [
  ["rc_trial_converted", "RevenueCat", "Trial → paid"],
  ["rc_subscription_started", "RevenueCat", "Direct paid starts"],
  ["rc_subscription_renewed", "RevenueCat", "Renewals"],
  ["sw_trial_converted", "Superwall", "Trial → paid"],
  ["sw_subscription_started", "Superwall", "Direct paid starts"],
  ["sw_subscription_renewed", "Superwall", "Renewals"],
  ["s2s_trial_converted", "Server events", "Trial → paid"],
  ["s2s_subscribe", "Server events", "Subscribe"],
  ["s2s_subscription_renewed", "Server events", "Renewals"],
  ["subscribe", "AppStack SDK", "Subscribe"],
  ["purchase", "AppStack SDK", "Purchase"],
] as const;
