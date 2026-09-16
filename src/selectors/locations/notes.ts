export const SetupNotesSelectors = {
  tabNotes: '[data-testid="location-settings-sub-tab-notes"]',

  sectionNotes: '[data-testid="location-settings-section-notes"]',

  tblNotes: '[data-testid="location-settings-table-notes"]',
  lblNoNotesAvailable: '[data-testid="location-settings-section-notes"] td:has-text("No Notes Available")',

 // Angular reactive form name pattern: notes.notes.{i}.note — selector follows this scheme.
  txtNoteRow0: 'textarea[name="notes.notes.0.note"]',
  txtNoteInputAll: '[data-testid="location-settings-section-notes"] textarea',

  btnNotesAdd: '[data-testid="location-settings-btn-add-note"]',
  btnNotesDelete: '[data-testid="location-settings-section-notes"] button:has-text("Delete")',

  lblNotesCharCounter: '[data-testid="location-settings-label-note-character-counter"]',
  barNotesProgress: '[data-testid="location-settings-label-note-character-progress"]',

  btnSaveNotes: '[data-testid="location-settings-btn-save"]',
} as const;
