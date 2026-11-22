import * as M from "@radix-ui/react-dropdown-menu";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;
export const MenuContent = ({ children, className, align = "end" }: { children: ReactNode; className?: string; align?: "start" | "end" | "center" }) => (
  <M.Portal><M.Content align={align} sideOffset={8} className={cn("z-[70] min-w-56 rounded-md border border-line bg-white p-1.5 shadow-pop", className)}>{children}</M.Content></M.Portal>
);
export const MenuItem = ({ className, ...p }: M.DropdownMenuItemProps) => <M.Item className={cn("flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm font-medium text-ink outline-none data-[highlighted]:bg-slate-100", className)} {...p} />;
export const MenuLabel = M.Label;
export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-line" />;
