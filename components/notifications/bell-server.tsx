// Server-side wrapper removed. The NotificationBell is now a self-contained
// client component that fetches its own initial count via the
// `unread_notification_count` RPC on mount. This keeps the navbar
// (also a client component) from accidentally pulling a server
// component into its client tree.
//
// If you want the initial count to be present on first paint (no
// loading flicker), wrap the navbar in a server component that
// fetches the count and passes it as a prop.

export {};
