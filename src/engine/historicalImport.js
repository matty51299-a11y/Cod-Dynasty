// TODO: When xlsx parsing is needed at runtime, implement parsing here.
// For now, historical roster data is manually transcribed from the spreadsheet
// into src/data/historicalRosters.js. The spreadsheet remains the source of
// truth at data/import/cod_manager_rosters_database.xlsx.
//
// Future work:
// - Parse additional era sheets (BO3, IW, WWII, BO4, MW2019)
// - Auto-generate historicalRosters.js from spreadsheet
// - Validate spreadsheet changes against existing save data

export const SPREADSHEET_PATH = "data/import/cod_manager_rosters_database.xlsx";

export const KNOWN_SHEETS = [
  { sheetName: "Ghosts", eraId: "ghosts", parsed: true },
  { sheetName: "Advanced Warfare", eraId: "advanced_warfare", parsed: true },
  { sheetName: "Black Ops 3", eraId: "black_ops_3", parsed: false },
  { sheetName: "Infinite Warfare", eraId: "infinite_warfare", parsed: false },
  { sheetName: "WWII", eraId: "wwii", parsed: false },
  { sheetName: "Black Ops 4", eraId: "black_ops_4", parsed: false },
  { sheetName: "Modern Warfare 2019", eraId: "modern_warfare_2019", parsed: false },
];

export function getImportStatus() {
  return KNOWN_SHEETS.map(s => ({
    ...s,
    status: s.parsed ? "ready" : "pending",
  }));
}
