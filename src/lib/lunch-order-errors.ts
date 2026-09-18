export function getLunchOrderErrorMessage(code: string): string {
  switch (code) {
    case "empty":
      return "Select at least one menu item before placing your order.";
    case "deadline":
      return "The ordering deadline has passed.";
    case "closed":
      return "Ordering is not available right now.";
    case "finalized":
      return "Ordering is unavailable because this lunch period has been finalized.";
    case "unavailable-item":
      return "One of the selected menu items is no longer available.";
    case "composition":
      return "This order combination is not valid. Choose one main with at least one side, or standalone items only.";
    case "instructions":
      return "Special instructions must be 500 characters or fewer.";
    case "location":
      return "Choose an active delivery location before placing your order.";
    default:
      return "Unable to complete the request. Please try again.";
  }
}
