// Loads the Google Maps JS API exactly once, by injecting the <script> tag ourselves.
// (`loading=async` is Google's current recommended mode: the script exposes
// `google.maps.importLibrary(...)`, and each library — maps, marker, ... — is fetched on demand.)

let loading: Promise<void> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (window.google?.maps?.importLibrary) return Promise.resolve(); // already on the page
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&v=weekly`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null; // allow a retry
      reject(new Error("Failed to load the Google Maps script (bad key, blocked, or offline?)"));
    };
    document.head.append(script);
  });
  return loading;
}
