// Helpers for the admin analytics endpoints.

function getRangeDates(range) {
  const to = new Date();
  let from = null;

  switch (range) {
    case "today": {
      from = new Date(to);
      from.setHours(0, 0, 0, 0);
      break;
    }
    case "7d":
      from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "90d":
      from = new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case "all":
    default:
      from = null;
  }

  return { from, to };
}

function getBucketGranularity(range) {
  switch (range) {
    case "today":
      return "hour";
    case "7d":
    case "30d":
      return "day";
    case "90d":
      return "week";
    case "all":
    default:
      return "month";
  }
}

// Build a `$match` clause that filters documents created within the range.
// `field` defaults to `createdAt`. Returns `{}` for the `all` preset.
function getRangeMatch(range, field = "createdAt") {
  const { from, to } = getRangeDates(range);
  if (!from) return {};
  return { [field]: { $gte: from, $lte: to } };
}

function getDateBucketStage(range, field = "createdAt") {
  const unit = getBucketGranularity(range);
  return {
    $dateTrunc: { date: `$${field}`, unit },
  };
}

module.exports = {
  getRangeDates,
  getBucketGranularity,
  getRangeMatch,
  getDateBucketStage,
};
