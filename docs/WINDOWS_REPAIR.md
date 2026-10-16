# Windows PDF failure: diagnosis and regression coverage

The failed workflow at https://github.com/StrokeDot/NOEMA/actions/runs/38849486417
reached 17 passing Rust tests and failed PDF extraction with an invalid trailer.
The committed PDF files themselves were valid. No PDF extraction dependency
change was necessary.

## Reproduction

On the original repository snapshot, a checkout with `core.autocrlf=true`
changed these mostly-ASCII PDF fixtures from LF to CRLF:

| Fixture | Original bytes | Converted bytes | Declared xref offset | Converted xref position |
|---|---:|---:|---:|---:|
| research.pdf | 1789 | 1884 | 1376 | 1446 |
| scanned.pdf | 1251 | 1321 | 881 | 928 |

PDF cross-reference tables and stream lengths count bytes. Newline conversion
invalidated those references even though the files still looked readable in a
text editor. This explains why regenerating valid text-heavy PDFs did not fix
the Windows checkout failure.

## Correction

`.gitattributes` declares `*.pdf binary`, disabling text conversion for PDFs.
A second Windows-style checkout preserved both files byte for byte. The importer,
PDF parser version, fixture bytes, application features, and migrations are unchanged.

Regression tests validate `startxref` and object offsets in the checked-out
fixtures, extract and search both pages with page locations, compare the stored
original with the imported bytes, and require the specific no-readable-text/OCR
error for the textless fixture instead of accepting any parser error.

The browser suite now waits for initial application loading and explicitly opens
the new-project form if an earlier test has created a project. Framework activation
asserts the final persisted checkbox state after the asynchronous write. The video
workflow additionally checks scene ordering after a reload.

## Installed application verification

`scripts/windows-smoke.mjs` runs only on a disposable Windows CI runner. It installs
the actual release NSIS package, launches the installed executable, checks that
it loads the embedded frontend, creates a book chapter, closes the native window,
relaunches and verifies the text, then repeats persistence checks for separate
video narration and visual directions. It does not start a development server.
Its app-specific WebView2 debugging policy exists only on the disposable runner
and is removed after testing. WebView2 150+ ignores environment/HKCU debugging
overrides for elevated hosts; this test uses the documented HKLM setting instead.
See https://github.com/MicrosoftEdge/WebView2Feedback/issues/5645.

The workflow retains a JSON report and screenshot separately from the installer.
A passing browser test alone is not reported as an installed Windows test.
