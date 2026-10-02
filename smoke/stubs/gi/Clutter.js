// Stand-in for the Clutter namespace.
//
// Mirrors Clutter 14 (GNOME 46) exactly where it matters: there is no bare
// `Align`, and ActorAlign has no MIDDLE member (only FILL/START/CENTER/END), so
// inventing either one fails here instead of only inside a live session.

export const ActorAlign = { FILL: 0, START: 1, CENTER: 2, END: 3 };

export default { ActorAlign };
