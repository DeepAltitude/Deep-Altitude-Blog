-- Additive only. Legacy Sprint/Habit records and private content remain intact.
ALTER TABLE projects ADD COLUMN progress INTEGER CHECK(progress IS NULL OR progress BETWEEN 0 AND 100);
ALTER TABLE projects ADD COLUMN deleted_at TEXT;
ALTER TABLE experiments ADD COLUMN show_progress INTEGER NOT NULL DEFAULT 0 CHECK(show_progress IN (0,1));
ALTER TABLE experiments ADD COLUMN deleted_at TEXT;
ALTER TABLE weekly_focus ADD COLUMN deleted_at TEXT;
