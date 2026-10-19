export type Exam = {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM-HH:MM
  prog: string;
  sem: number;
  sec: string;
  course: string;
  code: string;
  rooms: string[];
  instructor: string;
};

export type Day = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat";

export type ClassSection = {
  id: string; // e.g. "BCS-3A"
  prog: string;
  sem: number;
  sec: string;
  label: string;
  batch: string;
};

export type ClassSession = {
  cls: string;
  code: string;
  title: string;
  day: Day;
  start: string; // HH:MM 24h
  end: string;
  room: string;
  kind: "theory" | "lab";
  instructor: string;
  note: string;
  inferred: boolean;
};

export type OnlineCourse = {
  cls: string;
  code: string;
  title: string;
  inst: string;
  mode: string;
};
