const JAMAICA_TIME_ZONE = "America/Jamaica";

export function getJamaicaTodayDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JAMAICA_TIME_ZONE,
  }).format(new Date());
}
