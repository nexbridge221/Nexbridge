import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const control = "block w-full rounded-md border border-slate-300 bg-white px-3.5 py-2.5 text-[15px] text-ink placeholder:text-slate-500 transition-colors focus:border-nexus focus:outline-none focus:ring-2 focus:ring-nexus/30 disabled:bg-slate-100 aria-[invalid=true]:border-red-600 aria-[invalid=true]:ring-red-600/20";

interface FieldProps { label: string; error?: string; help?: string; optional?: boolean; children: (p: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode; className?: string }
/** Champ de formulaire accessible : label lié, aide et erreur reliées par aria-describedby. */
export function Field({ label, error, help, optional, children, className }: FieldProps) {
  const id = useId();
  const describedBy = [help ? `${id}-help` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-sm font-semibold text-night">
        {label}{optional && <span className="ml-1 font-normal text-muted">(facultatif)</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {help && <p id={`${id}-help`} className="text-[13px] text-muted">{help}</p>}
      {error && <p id={`${id}-err`} role="alert" className="text-[13px] font-medium text-red-700">{error}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn(control, className)} {...p} />);
Input.displayName = "Input";
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, rows = 4, ...p }, ref) => <textarea ref={ref} rows={rows} className={cn(control, "resize-y", className)} {...p} />);
Textarea.displayName = "Textarea";
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...p }, ref) => <select ref={ref} className={cn(control, "pr-8", className)} {...p}>{children}</select>);
Select.displayName = "Select";

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; error?: string }>(({ label, error, className, id, ...p }, ref) => {
  const auto = useId();
  const cid = id ?? auto;
  return (
    <div>
      <div className="flex items-start gap-3">
        <input ref={ref} id={cid} type="checkbox" className={cn("mt-1 h-5 w-5 shrink-0 rounded border-slate-400 accent-nexus", className)} aria-invalid={Boolean(error) || undefined} aria-describedby={error ? `${cid}-err` : undefined} {...p} />
        <label htmlFor={cid} className="text-sm leading-6 text-ink">{label}</label>
      </div>
      {error && <p id={`${cid}-err`} role="alert" className="mt-1 text-[13px] font-medium text-red-700">{error}</p>}
    </div>
  );
});
Checkbox.displayName = "Checkbox";
