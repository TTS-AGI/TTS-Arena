/** Official Hugging Face logo, served from /public/hf-logo.svg. */
export function HFLogo({ className = "h-4 w-4" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/hf-logo.svg" alt="Hugging Face" className={className} />;
}
