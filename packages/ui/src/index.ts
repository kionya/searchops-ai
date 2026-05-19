export const uiPackage = "ui" as const;

export interface BadgeProps {
  readonly label: string;
}

export function createBadgeLabel(props: BadgeProps) {
  return props.label.trim();
}