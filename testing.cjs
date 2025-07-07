const opening_hours = require("./src/index.js");
var oh = new opening_hours("We 12:00-14:00");

var from = new Date("01 Jan 2012");
var to = new Date("01 Feb 2012");

// high-level API
{
  var intervals = oh.getOpenIntervals(from, to);
  for (var i in intervals)
    console.log(
      "We are " +
        (intervals[i][2] ? "maybe " : "") +
        "open from " +
        (intervals[i][3] ? '("' + intervals[i][3] + '") ' : "") +
        intervals[i][0] +
        " till " +
        intervals[i][1] +
        "."
    );

  var duration_hours = oh.getOpenDuration(from, to).map(function (x) {
    return x / 1000 / 60 / 60;
  });
  if (duration_hours[0])
    console.log(
      "For the given range, we are open for " + duration_hours[0] + " hours"
    );
  if (duration_hours[1])
    console.log(
      "For the given range, we are maybe open for " +
        duration_hours[1] +
        " hours"
    );
}

// helper function
function getReadableState(startString, endString, oh, past) {
  if (past === true) past = "d";
  else past = "";

  var output = "";
  if (oh.getUnknown()) {
    output +=
      " maybe open" +
      (oh.getComment()
        ? ' but that depends on: "' + oh.getComment() + '"'
        : "");
  } else {
    output +=
      " " +
      (oh.getState() ? "open" : "close" + past) +
      (oh.getComment() ? ', comment "' + oh.getComment() + '"' : "");
  }
  return startString + output + endString + ".";
}

// simple API
{
  var state = oh.getState(); // we use current date
  var unknown = oh.getUnknown();
  var comment = oh.getComment();
  var nextchange = oh.getNextChange();

  console.log(getReadableState("We're", "", oh, true));

  if (typeof nextchange === "undefined")
    console.log("And we will never " + (state ? "close" : "open"));
  else
    console.log(
      "And we will " +
        (oh.getUnknown(nextchange) ? "maybe " : "") +
        (state ? "close" : "open") +
        " on " +
        nextchange
    );
}

// iterator API
{
  var iterator = oh.getIterator(from);

  console.log(getReadableState("Initially, we're", "", iterator, true));

  while (iterator.advance(to)) {
    console.log(
      getReadableState("Then we", " at " + iterator.getDate(), iterator)
    );
  }

  console.log(getReadableState("And till the end we're", "", iterator, true));
}