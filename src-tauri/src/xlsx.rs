//! Reads a timetable spreadsheet (.xlsx, first sheet) into the same CSV text the import already
//! understands, so Excel and CSV share one parser (and one set of line errors). Read-only; the
//! file never leaves the computer.

use std::io::Cursor;

use calamine::{Data, Reader, Xlsx};
use pluto_core::error::{AppError, Result};

/// One cell as text. Excel keeps times as a fraction of a day, so a number below one (or with a
/// fraction) in a time column reads as `HH:MM`.
pub fn cell_text(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        Data::String(s) | Data::DateTimeIso(s) | Data::DurationIso(s) => s.trim().to_owned(),
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        Data::Float(f) => number_text(*f),
        Data::DateTime(d) => number_text(d.as_f64()),
        Data::Error(_) => String::new(),
    }
}

fn number_text(f: f64) -> String {
    if f.fract().abs() < 1e-9 {
        return format!("{}", f.round() as i64);
    }
    let minutes = ((f.fract().abs()) * 1440.0).round() as u32 % 1440;
    format!("{:02}:{:02}", minutes / 60, minutes % 60)
}

fn csv_cell(s: &str) -> String {
    if s.contains([',', '"', '\n']) {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_owned()
    }
}

/// The first sheet of an .xlsx file as CSV text.
pub fn xlsx_to_csv(bytes: Vec<u8>) -> Result<String> {
    let unreadable = || {
        AppError::validation(
            "file",
            "Pluto could not read that Excel file. Save it as .xlsx or .csv and try again.",
        )
    };
    let mut book: Xlsx<_> =
        calamine::open_workbook_from_rs(Cursor::new(bytes)).map_err(|_| unreadable())?;
    let range = book
        .worksheet_range_at(0)
        .ok_or_else(unreadable)?
        .map_err(|_| unreadable())?;
    Ok(range
        .rows()
        .map(|r| {
            r.iter()
                .map(|c| csv_cell(&cell_text(c)))
                .collect::<Vec<_>>()
                .join(",")
        })
        .collect::<Vec<_>>()
        .join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn times_stored_as_day_fractions_read_as_hours_and_minutes() {
        assert_eq!(cell_text(&Data::Float(0.375)), "09:00");
        assert_eq!(cell_text(&Data::Float(0.5625)), "13:30");
        assert_eq!(cell_text(&Data::Float(0.395_833_333_3)), "09:30");
    }

    #[test]
    fn whole_numbers_and_text_stay_as_they_are() {
        assert_eq!(cell_text(&Data::Float(3.0)), "3");
        assert_eq!(cell_text(&Data::Int(7)), "7");
        assert_eq!(cell_text(&Data::String(" Mon ".into())), "Mon");
        assert_eq!(cell_text(&Data::Empty), "");
    }

    #[test]
    fn a_file_that_is_not_a_workbook_is_refused_in_plain_words() {
        let e = xlsx_to_csv(b"not a zip".to_vec()).unwrap_err();
        assert!(e.message.contains("could not read"));
    }
}
