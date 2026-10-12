import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './workspace-navigation.css';

const NavigationTarget = createContext<HTMLElement | null>(null);
const InsideNavigation = createContext(false);

// Navigation sits outside animated pages. Nested headers stay beside their tabs.
export function WorkspaceNavigation({ children }: { children: ReactNode }) {
  const target = useContext(NavigationTarget);
  const nested = useContext(InsideNavigation);
  const content = <InsideNavigation.Provider value={true}>{children}</InsideNavigation.Provider>;
  return target && !nested ? createPortal(content, target) : content;
}

export function WorkspaceNavigationLayout({ context, children }: { context: ReactNode; children: ReactNode }) {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const header = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = header.current;
    if (!element) return;
    const main = element.closest<HTMLElement>('.workspace-main');
    const measure = () => main?.style.setProperty('--workspace-page-navigation-height', `${element.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <NavigationTarget.Provider value={target}>
    <header ref={header} className="workspace-page-navigation" aria-label="当前页面导航">
      {context}
      <div ref={setTarget} className="workspace-page-navigation-content" />
    </header>
    {children}
  </NavigationTarget.Provider>;
}
