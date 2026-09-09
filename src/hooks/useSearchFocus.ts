import { useEffect, type RefObject } from "react";

function isEditableElement(element: Element | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

function isInsideModal(element: Element | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return false;
  return Boolean(
    element.closest('.modal, [role="dialog"], dialog'),
  );
}

/**
 * Focuses the referenced search input when the user presses Ctrl+F
 * (Windows/Linux) or Cmd+F (macOS), mirroring the native find shortcut.
 *
 * The shortcut is ignored when the search input is not mounted, when a
 * modal dialog is open, or when focus is already inside another editable
 * field, so standard editing shortcuts keep working everywhere else.
 */
export function useSearchFocus(
  searchRef: RefObject<HTMLInputElement | null>,
) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "f") return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.altKey) return;

      const search = searchRef.current;
      if (!search) return;
      if (document.querySelector(".modal-backdrop")) return;

      const target =
        event.target instanceof Element ? event.target : null;
      if (isInsideModal(target)) return;
      if (isEditableElement(target) && target !== search) return;
      if (
        isEditableElement(document.activeElement) &&
        document.activeElement !== search
      ) {
        return;
      }

      event.preventDefault();
      search.focus({ preventScroll: true });
      search.select();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [searchRef]);
}
