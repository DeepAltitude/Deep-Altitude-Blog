PRAGMA foreign_keys = ON;
CREATE TABLE projects (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', outcome TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','completed','paused','abandoned')),
 start_date TEXT, end_date TEXT, domain TEXT, topic TEXT,
 tags TEXT NOT NULL DEFAULT '[]', visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')),
 featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE experiments (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '', hypothesis TEXT NOT NULL DEFAULT '', protocol TEXT NOT NULL DEFAULT '',
 observe TEXT NOT NULL DEFAULT '', conclusion TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'idea' CHECK(status IN ('idea','planned','active','completed','paused','abandoned')),
 start_date TEXT, end_date TEXT, project TEXT REFERENCES projects(id) ON DELETE SET NULL,
 domain TEXT, topic TEXT, tags TEXT NOT NULL DEFAULT '[]', principles TEXT NOT NULL DEFAULT '[]',
 visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','public')), featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE experiment_observations (
 id TEXT PRIMARY KEY, experiment TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
 date TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE sprints (
 id TEXT PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','completed','cancelled')),
 start_date TEXT, end_date TEXT, project TEXT REFERENCES projects(id) ON DELETE SET NULL,
 goals TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE habits (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, recurrence TEXT NOT NULL DEFAULT 'daily' CHECK(recurrence IN ('daily','weekdays','days','weekly')),
 weekdays TEXT NOT NULL DEFAULT '[]', weekly_target INTEGER NOT NULL DEFAULT 1 CHECK(weekly_target BETWEEN 1 AND 7),
 quantity TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE habit_entries (
 habit TEXT NOT NULL REFERENCES habits(id) ON DELETE CASCADE, date TEXT NOT NULL, quantity TEXT NOT NULL DEFAULT '',
 updated_at TEXT NOT NULL, PRIMARY KEY(habit,date)
);
CREATE TABLE weekly_focus (
 week TEXT PRIMARY KEY, items TEXT NOT NULL DEFAULT '[]', version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE content_drafts (
 id TEXT PRIMARY KEY, document TEXT NOT NULL, save_token TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE draft_media (
 draft_id TEXT NOT NULL REFERENCES content_drafts(id) ON DELETE CASCADE,
 image_id TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL,
 PRIMARY KEY(draft_id,image_id,part)
);
CREATE TABLE oauth_connections (
 provider TEXT PRIMARY KEY CHECK(provider='google'), encrypted_token TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE calendar_preferences (
 id INTEGER PRIMARY KEY CHECK(id=1), calendars TEXT NOT NULL DEFAULT '[]', default_calendar TEXT NOT NULL DEFAULT '',
 timezone TEXT NOT NULL DEFAULT 'Europe/Zurich', version INTEGER NOT NULL DEFAULT 1
);
INSERT INTO calendar_preferences(id) VALUES(1);
CREATE INDEX projects_visibility_status ON projects(visibility,status);
CREATE INDEX experiments_visibility_status ON experiments(visibility,status);
CREATE INDEX experiments_project ON experiments(project);
CREATE INDEX sprints_project ON sprints(project);
CREATE INDEX observations_experiment_date ON experiment_observations(experiment,date);
CREATE INDEX habit_entries_date ON habit_entries(date);
