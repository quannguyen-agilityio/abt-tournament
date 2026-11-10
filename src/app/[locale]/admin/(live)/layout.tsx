/**
 * The live scoring screens (spec-phase-2 §8.1) fill the screen: no sidebar and no site header, the
 * screen has its own top bar. The scorer sits at the court on a phone or tablet.
 */
export default function LiveLayout({ children }: LayoutProps<'/[locale]/admin'>) {
  return <div className="bg-background flex min-h-dvh flex-1 flex-col">{children}</div>;
}
