export function ErrorFallback() {
  return (
    <div role="alert">
      <h1>Something went wrong.</h1>
      <p>Please reload the page. If the problem persists, contact support.</p>
      <button type="button" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
