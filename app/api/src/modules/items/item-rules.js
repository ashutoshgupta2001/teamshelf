import { normalizeName } from "@teamshelf/contracts";
import { AppError } from "../../common/errors/app-error.js";

export function prepareItemName(name) {
  const displayName = name.trim().normalize("NFC");
  if (
    !displayName ||
    displayName.length > 255 ||
    displayName.includes("/") ||
    [...displayName].some(
      (char) => char.charCodeAt(0) <= 31 || char.charCodeAt(0) === 127,
    )
  ) {
    throw new AppError("INVALID_ITEM_NAME", "The item name is invalid.", 400);
  }
  return { displayName, normalizedName: normalizeName(displayName) };
}

export function assertMoveAllowed(item, parent, descendantIds = []) {
  if (item.itemType === "ROOT")
    throw new AppError(
      "ROOT_IMMUTABLE",
      "The workspace root cannot be changed.",
      400,
    );
  if (
    !parent ||
    !["ROOT", "FOLDER"].includes(parent.itemType) ||
    parent.deletedAt
  )
    throw new AppError(
      "INVALID_PARENT",
      "The destination folder is unavailable.",
      400,
    );
  if (item.id === parent.id || descendantIds.includes(parent.id))
    throw new AppError(
      "FOLDER_CYCLE",
      "A folder cannot be moved into itself or one of its descendants.",
      409,
    );
}
