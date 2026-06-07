export function AuthBackground() {
  return (
    <>
      <div className="pointer-events-none fixed inset-0 bg-[#070d18]" aria-hidden />
      <div
        className="pointer-events-none fixed inset-0 bg-gradient-to-br from-[#0f1c33] via-[#0a1220] to-[#04070f]"
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 landing-hero-glow opacity-70" aria-hidden />
      <div
        className="pointer-events-none fixed inset-0 landing-lightning-accent opacity-50"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.2] bg-[linear-gradient(rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.07)_1px,transparent_1px)] bg-[size:56px_56px]"
        aria-hidden
      />
    </>
  );
}
