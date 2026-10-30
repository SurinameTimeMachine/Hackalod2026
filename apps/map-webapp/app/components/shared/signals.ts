// Websocket signals from the app server ({type:'select'|'contributions-changed', personId}).
// No-op until the server endpoint exists; keeps the projection's wiring in place.
export function useSignals(onSelect: (patientId: number) => void) {
  void onSelect;
}
