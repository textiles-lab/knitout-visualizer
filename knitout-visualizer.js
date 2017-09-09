//protect rest of document from spurious variables:
/*DEBUG, don't: (function(){ */

//parseKnitout will parse knitout, catch syntax errors, and dispatch to calls on 'machine', an abstract knitting machine:
function parseKnitout(codeText, machine) {
	var errors = [];
	var warnings = [];

	var carrierNames = [];

	var inCommentHeader = true;
	var end = false;
	
	codeText.split("\n").forEach(function(line, lineNumber) {
		if (end) return;
		function addError(info) {
			console.log("Parse Error on line " + lineNumber + ": " + info);
			errors.push({lineNumber:lineNumber, text:info});
		}
		function addWarning(info) {
			console.log("Parse Warning on line " + lineNumber + ": " + info);
			warnings.push({lineNumber:lineNumber, text:info});
		}

		//magic first line:
		if (lineNumber == 0) {
			//knitout must begin with ';!knitout-N'.
			var m = line.match(/^;!knitout-(\d+)$/);
			if (m !== null) {
				if (parseInt(m[1]) != 2) {
					addWarning("Parsed version (" + m.groups(1) + ") is not what was expected.");
				}
			} else {
				addError("Knitout should always start with a '!;knitout-2' line.");
			}
			//nothing more to do with the first line.
			return;
		}

		//comment header lines:
		var m = line.match(/^;;([^:]+): (.*)$/);
		if (m !== null) {
			if (!inCommentHeader) {
				addWarning("Comment-header-like line outside comment header.");
			} else {
				var name = m[1];
				var value = m[2];
				console.log("Comment header: '" + name + "' is '" + value + "'.");
				//TODO: handle comment headers.
				if (name === "Carriers") {
					carrierNames = value.split(" ");
					machine.setCarriers(carrierNames);
					console.log("Carrier names (front-to-back): ", carrierNames);
				}
				return; //nothing left to do with this line.
			}
		} else {
			inCommentHeader = false;
		}

		//split line into op and comment parts:
		var m = line.match(/^([^;]*)(;.*)?$/);
		if (m === null) {
			console.log("Weird, our line regex should have gotten everything.");
			return;
		}
		var tokens = m[1].split(/[ \t]+/);
		var comment = m[2];

		//TODO: handle !source: directive in comment

		//trim leading/trailing whitespace from operation token list:
		if (tokens.length !== 0 && tokens[0] === "") tokens.shift();
		if (tokens.length !== 0 && tokens[tokens.length-1] === "") tokens.pop();

		if (tokens.length === 0) {
			//empty operation: nothing to do
			return;
		}

		var op = tokens.shift();

		function parseCarrierSet(tokens) {
			//check that tokens are in carrierNames and aren't repeated:
			var usedAlready = {};
			tokens.forEach(function(name){
				if (carrierNames.indexOf(name) == -1) {
					throw "Carrier name does not appear in Carriers header.";
				}
				if (name in usedAlready) {
					throw "Carrier name appears twice in carrier set.";
				}
				usedAlready[name] = true;
			});
			return tokens.slice();
		}
		function parseStitchValue(token) {
			if (!/^[-+]?(\.\d+|\d+.\d*|\d+)$/.test(token)) {
				throw "Stitch value [" + token + "] must be a simple floating point value.";
			}
			return parseFloat(token);
		}
		function parseRackingValue(token) {
			if (!/^[-+]?(\.\d+|\d+.\d*|\d+)$/.test(token)) {
				throw "Racking value [" + token + "] must be a simple floating point value.";
			}
			return parseFloat(token);
		}
		function parseDirection(token) {
			if (!(token === '-' || token === '+')) {
				throw "Direction [" + token + "] must be '+' or '-'.";
			}
			return token;
		}
		function parseNeedle(token) {
			if (!/^([fb]s?)([-+]?\d+)$/.test(token)) throw "Needle [" + token + "] must be f,b,fs, or bs followed by an integer.";
			return token;
		}


		//dispatch all basic knitout functions to the machine, catch anything thrown and add to errors:
		try {
			//all the in/out/hook ops take a carrierset as an argument:
			if (["in", "out", "inhook", "releasehook", "outhook"].indexOf(op) !== -1) {
				var cs = parseCarrierSet(tokens);
				machine[op](cs);
			} else if (op === "stitch") {
				if (tokens.length !== 2) throw "stitch takes exactly two arguments";
				var l = parseStitchValue(tokens[0]);
				var t = parseStitchValue(tokens[1]);
				machine.stitch(l, t);
			} else if (op === "rack") {
				if (tokens.length !== 1) throw "rack takes exactly one argument";
				var r = parseRackingValue(tokens[0]);
				machine.rack(r);
			} else if (op === "knit" || op === "drop") {
				if (op === "drop") {
					if (tokens.length !== 1) throw "drop takes exactly one argument";
					//interpret drop as "knit + N":
					tokens.unshift("+");
				}
				if (tokens.length < 2) throw "knit requires at least two arguments";
				var d = parseDirection(tokens.shift());
				var n = parseNeedle(tokens.shift());
				var cs = parseCarrierSet(tokens);
				machine.knit(d, n, cs);
			} else if (op === "tuck" || op === "amiss") {
				if (op === "amiss") {
					if (tokens.length !== 1) throw "amiss takes exactly one argument";
					tokens.unshift("+");
				}
				if (tokens.length < 2) throw "tuck requires at least two arguments";
				var d = parseDirection(tokens.shift());
				var n = parseNeedle(tokens.shift());
				var cs = parseCarrierSet(tokens);
				machine.tuck(d, n, cs);
			} else if (op === "split" || op === "xfer") {
				if (op === "xfer") {
					if (tokens.length !== 2) throw "xfer takes exactly two arguments";
					tokens.unshift("+");
				}
				if (tokens.length < 3) throw "split requires at least three arguments";
				var d = parseDirection(tokens.shift());
				var n = parseNeedle(tokens.shift());
				var n2 = parseNeedle(tokens.shift());
				var cs = parseCarrierSet(tokens);
				machine.split(d, n, n2, cs);
			} else if (op === "miss") {
				if (tokens.length < 2) throw "miss requires at least two arguments";
				var d = parseDirection(tokens.shift());
				var n = parseNeedle(tokens.shift());
				var cs = parseCarrierSet(tokens);
				machine.miss(d, n, cs);
			} else if (op === "pause") {
				if (tokens.length !== 0) throw "pause takes no arguments";
				machine.pause();
			} else if (op === "x-end") {
				end = true;
			} else {
				if (op.startsWith("x-")) {
					addWarning("Unrecognized extension operation '" + op + "'.");
				} else {
					addError("Unrecognized operation.");
				}
			}
		} catch (e) {
			if (typeof(e) === "string") {
				addError(e);
			} else {
				addError("[error that wasn't a string]");
				throw e;
				//console.log(e); //DEBUG
			}
		}

	});
}

//RecordMachine is an abstract knitting machine that records the loop structure of a knitout document:

//Idea:
// track shapes using yarns between anchors.
// templates are used to place anchors.
// TODO: we are careful to track the front-to-back order of yarns between anchors

//Depths (viewed from above):

//    (back bed)
// -2 -------
//    (back sliders)
// -1 -------
//       (empty area)
//  0 -------
//    (carriers)
//  1 -------
//    (front sliders)
//  2 -------
//    (front bed)

function Guide(bed, points) {
	console.assert(bed, "must pass real bed");
	console.assert(points, "must pass list of points");
	points = points.slice(); //copy array
	points.forEach(function(p){
		console.assert('x' in p && 'y' in p && 'z' in p, "points must have x,y,z");
		console.assert(!isNaN(p.x) && !isNaN(p.y) && !isNaN(p.z), "points must have x,y,z");
	});
	this.bed = bed; //anchors are relative to a 'bed', which can translate them.
	this.points = points;

	this.segments = []; //back-to-front ordered stack of yarns through this anchor.
}

//Yarns are made of a series of segments that go through guides (each guide may have several points):
function Segment(guide, direction) {
	this.guide = guide;
	this.direction = direction; //does the yarn pass through the guide points in 0...N (+) or N...0 (-) order?

	//yarns are maintained as doubly linked lists:
	this.yarn = null;
	this.next = null;
	this.prev = null;
}

function Yarn() {
	//head and tail of doubly-linked Segment list:
	this.head = null;
	this.tail = null;
}

Yarn.prototype.eraseSegment = function(segment) {
	if (segment === this.head) this.head = this.head.next;
	if (segment === this.tail) this.tail = this.tail.prev;

	if (segment.next) segment.next.prev = segment.prev;
	if (segment.prev) segment.prev.next = segment.next;

	segment.yarn = null;
	segment.next = segment.prev = null;

	var i = segment.guide.segments.indexOf(segment);
	console.assert(i !== -1, "segment should appear in guide, right?");
	segment.guide.splice(i, 1);
};

Yarn.prototype.insertGuide = function(before, guide, direction) {
	var segment = new Segment(guide, direction);
	segment.yarn = this;

	if (this.head === null || this.tail === null) {
		console.assert(this.head === null && this.tail === null, "empty -> both start and end are empty");
		console.assert(before === null, "can't insert before anything if yarn is empty");
		this.head = this.tail = segment;
		return;
	}

	segment.next = before;
	segment.prev = (before === null ? this.end : before.prev);

	if (segment.next !== null) segment.next.prev = segment;
	if (segment.prev !== null) segment.prev.next = segment;

	if (this.head.prev !== null) this.head = this.head.prev;
	if (this.tail.next !== null) this.tail = this.tail.next;

	console.assert(this.head.prev === null && this.tail.next === null, "head/tail properly updated");

	guide.segments.push(segment);
};

//"Cards" are templates used to shape yarn into specific stitches.
function Card() {
	//cards will have a list of guides, and generally convenience properties for specific guides as well.
	this.guides = [];
}

//"Beds" hold (and translate) anchors
// slight misnomer, in that there are maybe separate "beds" for needles and for the cards below needles, ... and maybe even for carriers?
function Bed(x,y,z) {
	this.x = x;
	this.y = y;
	this.z = z;
	this.cards = [];
}

//TODO: functions to flip cards over z axis?

var NEEDLE_SPACING = 1.0;
var LOOP_WIDTH = 0.5;
var LOOP_HEIGHT = 0.6;
var LOOP_PADDING = 0.2;

function makeNeedleCard(bed, index) {
	var card = new Card();
	var x = NEEDLE_SPACING * index;
	card.loop = new Guide(bed, [
		{x:x - 0.5 * LOOP_WIDTH, y:-0.5 * LOOP_HEIGHT, z: 0.0},
		{x:x - 0.5 * LOOP_WIDTH, y: 0.5 * LOOP_HEIGHT, z: 0.0},
		{x:x + 0.5 * LOOP_WIDTH, y: 0.5 * LOOP_HEIGHT, z: 0.0},
		{x:x + 0.5 * LOOP_WIDTH, y:-0.5 * LOOP_HEIGHT, z: 0.0}
	]);
	card.guides.push(card.loop);

	return card;
}

function makeKnitCard(bed, index, y, pullZ) {
	var card = new Card();
	var x = NEEDLE_SPACING * index;
	var d = 0.1;
	card.loop = new Guide(bed, [
		{x:x - 0.5 * LOOP_WIDTH,     y:y - 0.5 * LOOP_HEIGHT, z:0.0},
		{x:x - 0.5 * LOOP_WIDTH - d, y:y + d, z: 0.0},
		{x:x + 0.5 * LOOP_WIDTH + d, y:y + d, z: 0.0},
		{x:x + 0.5 * LOOP_WIDTH,     y:y - 0.5 * LOOP_HEIGHT, z:0.0}
	]);
	card.leftYarn = new Guide(bed, [
		{x:x - 0.5 * NEEDLE_SPACING, y:y, z:0.0},
		{x:x - 0.5 * LOOP_WIDTH + d, y:y - d, z:0.0},
		{x:x - 0.5 * LOOP_WIDTH, y:y + 0.5 * LOOP_HEIGHT, z: 0.0}
	]);
	card.rightYarn = new Guide(bed, [
		{x:x + 0.5 * LOOP_WIDTH, y:y + 0.5 * LOOP_HEIGHT, z: 0.0},
		{x:x + 0.5 * LOOP_WIDTH - d, y:y - d, z:0.0},
		{x:x + 0.5 * NEEDLE_SPACING, y:y, z:0.0}
	]);

	card.guides.push(card.loop, card.leftYarn, card.rightYarn);

	return card;
}

//loop edges between cards are always clear from stack order
//yarn edges between cards are always to adjacent stacks(?) and might also be clear(??)

function RecordMachine() {
	this.beds = {
		b:new Bed(0.0, 0.0, -2.0),
		bs:new Bed(0.0, 0.0, -1.0),
		fs:new Bed(0.0, 0.0, 1.0),
		f:new Bed(0.0, 0.0, 2.0)
	};
	this.needleBeds = {
		b:new Bed(0.0, 0.0, -2.0),
		bs:new Bed(0.0, 0.0, -1.0),
		fs:new Bed(0.0, 0.0, 1.0),
		f:new Bed(0.0, 0.0, 2.0)
	};
	this.carrierBed = new Bed(0.0, 0.0, 0.0);

	//name -> carriers map starts empty:
	this.carriers = {};
	//bed starts empty: (but will be filled with needle cards)
	this.needles = {};
	this.needlesY = 0.0;

	//all yarns, including inactive ones:
	this.yarns = [];

	//beds start aligned:
	this.racking = 0.0;
	//stitch values start zeroed:
	this.stitchValues = [0.0, 0.0];
}

RecordMachine.prototype.getNeedle = function(n) {
	if (!(n in this.needles)) {
		var bsi = parseNeedle(n);
		var bed = this.needleBeds[bsi.bed + (bsi.slider ? 's' : '')];
		var needle = makeNeedleCard(bed, bsi.index);
		needle.horizonY = 0.0; //top of the topmost thing below this needle, used to push beds upwards
		this.needles[n] = needle;
	}
	return this.needles[n];
};

//set the carriers in front-to-back order; carriers start out of action at the right:
RecordMachine.prototype.setCarriers = function(cs) {
	this.carriers = {};
	cs.forEach(function(n, i){
		this.carriers[n] = {
			guide:new Guide(this.carrierBed, [{x:Infinity, y:1.0, z:(i + 0.5) / cs.length}])
			// yarn: <-- if in.
			// mark: <-- if marked to come in.
		};
	}, this);
};

//helper to split needle into bed, slider, index:
function parseNeedle(n) {
	var m = n.match(/^([fb])(s?)([-+]?\d+)$/);
	console.assert(m !== null, "needle should always be parseable");
	return {
		bed:m[1],
		slider:(m[2] === "s"),
		index:parseInt(m[3])
	};
}

RecordMachine.prototype.markIn = function(cs, hook) {
	//check parameters:
	cs.forEach(function(cn){
		if (!(cn in this.carriers)) throw "Carrier name [" + cn + "] not in carrier list.";
		var c = this.carriers[cn];
		if (c.yarn) throw "Carrier [" + cn + "] is already in action.";
		if (c.mark) throw "Carrier [" + cn + "] is already marked to come in.";
	}, this);
	//mark carriers:
	var mark = {
		cs:cs.slice(),
		hook:hook
	};
	cs.forEach(function(cn){
		this.carriers[cn].mark = mark;
	}, this);
};

RecordMachine.prototype.bringInIfNeeded = function(d, n, cs) {
	//if any carrier hasn't made a stitch, then need to bring them (all) in:
	var needIn = false;
	cs.forEach(function(cn){
		if (!(cn in this.carriers)) throw "Carrier name [" + cn + "] not in carrier list.";
		var c = this.carriers[cn];
		if (!c.yarn) needIn = true;
	}, this);
	if (!needIn) return;

	//check that cs is marked for in, and that mark *matches*:
	var mark = null;
	cs.forEach(function(cn){
		if (!(cn in this.carriers)) throw "Carrier name [" + cn + "] not in carrier list.";
		var c = this.carriers[cn];
		if (!c.mark) throw "Carrier [" + cn + "] is not marked to come in.";
		if (mark === null) mark = c.mark;
		if (JSON.stringify(c.mark.cs) !== JSON.stringify(cs)) throw "Carrier [" + cn + "] is not marked to come in as part of carrier set " + JSON.stringify(cs) + ".";
		console.assert(mark === c.mark, "marks on the same carrier set should always match");
	}, this);

	//'at' is where the hook parks (and where the carriers begin):
	// (that is, just before 'n' in direction 'd')
	var bsi = parseNeedle(n);
	var at = NEEDLE_SPACING * (bsi.index + (d === '+' ? -0.5 : 0.5) + (bsi.bed === 'b' ? this.racking : 0.0) );

	//move carriers, create yarn, remove mark:
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		c.guide.points.forEach(function(p){ p.x = at; });

		delete c.mark;

		var yarn = new Yarn();
		yarn.insertGuide(null, c.guide, '+');
		c.yarn = yarn;
		this.yarns.push(yarn);
	}, this);

	//create a new holding hook, if needed:
	if (mark.hook) {
		var hook = {
			at:at,
			cs:cs.slice()
		};
		cs.forEach(function(cn){
			this.carriers[cn].hook = hook;
		}, this);
	}
}

RecordMachine.prototype.bringOut = function(cs, hook) {
	//check that all carriers are actually in, are not in a hook, and have knit something:
	cs.forEach(function(cn){
		if (!(cn in this.carriers)) throw "Carrier name [" + cn + "] not in carrier list.";
		var c = this.carriers[cn];
		if (!c.last) throw "Carrier [" + cn + "] is not in action.";
		if (c.hook) throw "Carrier [" + cn + "] is in a holding hook.";
		if (c.mark) throw "Carrier [" + cn + "] is marked to come in.";
	}, this);
	//TODO: sanity check that when using hook there's a reasonable place to park it?

	//take carriers out:
	cs.forEach(function(cn){
		var c = this.carriers[cn];

		c.guide.points.forEach(function(p){ p.x = Infinity; });

		console.assert(c.yarn.tail === c.guide, "yarn still attached.");
		c.yarn.eraseSegment(c.yarn.tail);

		//TODO: disconnect from yarn
	}, this);
};

RecordMachine.prototype.in = function(cs) { this.markIn(cs, false); };
RecordMachine.prototype.inhook = function(cs) { this.markIn(cs, true); };

RecordMachine.prototype.releasehook = function(cs) {
	//check that all of 'cs' is held in the same hook:
	var hook = null;
	cs.forEach(function(cn){
		if (!(cn in this.carriers)) throw "Carrier name [" + cn + "] not in carrier list.";
		var c = this.carriers[cn];
		if (!c.hook) throw "Carrier [" + cn + "] is not in a hook.";
		if (hook === null) hook = c.hook;
		if (JSON.stringify(c.hook.cs) !== JSON.stringify(cs)) throw "Carrier [" + cn + "] is not in a hook with carrier set " + JSON.stringify(cs) + ".";
		console.assert(hook === c.hook, "hooks on the same carrier set should always match");
	}, this);

	//remove from hook:
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		delete c.hook;
	}, this);
};
RecordMachine.prototype.out = function(cs) { this.bringOut(cs, false); }
RecordMachine.prototype.outhook = function(cs) { this.bringOut(cs, true); }

RecordMachine.prototype.stitch = function(l, t) {
	this.stitchValues = {l:l, t:t};
};
RecordMachine.prototype.rack = function(r) {
	this.racking = r;
};

RecordMachine.prototype.moveCarriers = function(d, n, cs) {
	var bsi = parseNeedle(n);
	var at = NEEDLE_SPACING * (bsi.index + (d === '+' ? -0.5 : 0.5) + (bsi.bed === 'b' ? this.racking : 0.0));
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		console.assert(c.yarn.tail.guide === c.guide, "carrier should have yarn connected");
		c.guide.points.forEach(function(p){ p.x = at; });
	}, this);
};

RecordMachine.prototype.knit = function(d, n, cs) {
	var bsi = parseNeedle(n);
	if (bsi.slider) throw "Can't knit on a slider.";

	//bring in carriers if needed:
	this.bringInIfNeeded(d, n, cs);

	//move carriers into position (TODO: make yarn overlaps)
	this.moveCarriers(d, n, cs);

	//Grab the card for this needle:
	var needle = this.getNeedle(n);

	//Figure out if needle beds need shoving:
	if (needle.horizonY + 1.5 * LOOP_HEIGHT + LOOP_PADDING > this.needlesY) {
		this.needlesY = needle.horizonY + 1.5 * LOOP_HEIGHT + LOOP_PADDING;
		['b','bs','fs','f'].forEach(function(n){
			this.needleBeds[n].y = this.needlesY;
		}, this);
		this.carrierBed.y = this.needlesY;
	}
	needle.horizonY = this.needlesY - 0.5 * LOOP_HEIGHT;

	//make knit-shaped card:
	var knit = makeKnitCard(this.beds[bsi.bed + (bsi.slider ? 's' : '')], bsi.index, needle.horizonY - 0.5 * LOOP_HEIGHT, (bsi.bed === 'f' ? 1.0 :-1.0));

	//Re-route segments through knit's loop:
	knit.loop.segments = needle.loop.segments;
	needle.loop.segments = [];

	//adjust pointers:
	knit.loop.segments.forEach(function(segment){
		segment.guide = knit.loop;
	});

	//form new loop:
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		console.assert(c.yarn.tail.guide === c.guide, "yarn connected to carrier");
		if (d === '+') {
			c.yarn.insertGuide(c.yarn.tail, knit.leftYarn, '+');
			c.yarn.insertGuide(c.yarn.tail, needle.loop, '+');
			c.yarn.insertGuide(c.yarn.tail, knit.rightYarn, '+');
		} else {
			c.yarn.insertGuide(c.yarn.tail, knit.rightYarn, '-');
			c.yarn.insertGuide(c.yarn.tail, needle.loop, '-');
			c.yarn.insertGuide(c.yarn.tail, knit.leftYarn, '-');
		}
		console.assert(c.yarn.tail.guide === c.guide, "yarn still connected to carrier");
	}, this);

	//move carriers to other side of stitch:
	var at = NEEDLE_SPACING * (bsi.index + (d === '+' ? 0.5 : -0.5) + (bsi.bed === 'b' ? this.racking : 0.0));
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		console.assert(c.yarn.tail.guide === c.guide, "carrier should have yarn connected");
		c.guide.points.forEach(function(p){ p.x = at; });
	}, this);

};
RecordMachine.prototype.tuck = function(d, n, cs) {
	var bsi = parseNeedle(n);
	if (bsi.slider) throw "Can't knit on a slider.";

	//bring in carriers if needed:
	this.bringInIfNeeded(d, n, cs);

	//move carriers into position (TODO: make yarn overlaps)
	this.moveCarriers(d, n, cs);

	//Grab the card for this needle:
	var needle = this.getNeedle(n);

	//TODO: add a some 'tuck-like' yarn guides into the mix

	//form new loop:
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		console.assert(c.yarn.tail.guide === c.guide, "yarn connected to carrier");
		if (d === '+') {
			c.yarn.insertGuide(c.yarn.tail, needle.loop, '+');
		} else {
			c.yarn.insertGuide(c.yarn.tail, needle.loop, '-');
		}
		console.assert(c.yarn.tail.guide === c.guide, "yarn still connected to carrier");
	}, this);

	//move carriers to other side of stitch:
	var at = NEEDLE_SPACING * (bsi.index + (d === '+' ? 0.5 : -0.5) + (bsi.bed === 'b' ? this.racking : 0.0));
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		console.assert(c.yarn.tail.guide === c.guide, "carrier should have yarn connected");
		c.guide.points.forEach(function(p){ p.x = at; });
	}, this);

};
RecordMachine.prototype.split = function(d, n, n2, cs) {
	var bsi = parseNeedle(n);
	var bsi2 = parseNeedle(n2);
	if (bsi.slider && cs.length) throw "Can't split from a slider.";
	if (bsi.slider && bsi2.slider) throw "Can't transfer slider-to-slider.";

	//bring in carriers if needed:
	this.bringInIfNeeded(d, n, cs);

	//move carriers into position (TODO: make yarn overlaps)
	this.moveCarriers(d, n, cs);

	//Grab the card for this needle:
	var needle = this.getNeedle(n);

	//TODO: add a some 'tuck-like' yarn guides into the mix

	//form new loop:
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		console.assert(c.yarn.tail.guide === c.guide, "yarn connected to carrier");
		if (d === '+') {
			c.yarn.insertGuide(c.yarn.tail, needle.loop, '+');
		} else {
			c.yarn.insertGuide(c.yarn.tail, needle.loop, '-');
		}
		console.assert(c.yarn.tail.guide === c.guide, "yarn still connected to carrier");
	}, this);

	//move carriers to other side of stitch:
	var at = NEEDLE_SPACING * (bsi.index + (d === '+' ? 0.5 : -0.5) + (bsi.bed === 'b' ? this.racking : 0.0));
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		console.assert(c.yarn.tail.guide === c.guide, "carrier should have yarn connected");
		c.guide.points.forEach(function(p){ p.x = at; });
	}, this);
};
RecordMachine.prototype.miss = function(d, n, cs) {
};
RecordMachine.prototype.pause = function() {
};


//create an SVG from stacks:
RecordMachine.prototype.drawStacks = function() {
	var svgNS = 'http://www.w3.org/2000/svg';
	var svg = document.createElementNS(svgNS, 'svg');
	window.svg = svg; //DEBUG

	var min = {x:Infinity, y:-0.5};
	var max = {x:-Infinity, y:0.5};

	this.yarns.forEach(function(yarn){
		for (var segment = yarn.head; segment !== null; segment = segment.next) {
			var bed = segment.guide.bed;
			segment.guide.points.forEach(function(p){
				min.x = Math.min(min.x, p.x + bed.x);
				min.y = Math.min(min.y, p.y + bed.y);
				min.z = Math.min(min.z, p.z + bed.z);

				max.x = Math.max(max.x, p.x + bed.x);
				max.y = Math.max(max.y, p.y + bed.y);
				max.z = Math.max(max.z, p.z + bed.z);
			});
		}
	});

	console.log("Have " + this.yarns.length + " yarns, in the [" + min.x + ", " + max.x + "]x[" + min.y + "," + max.y + "] range.");

	var width = 1.0;
	if (min.x < max.x) {
		width = max.x - min.x + 1.0;
	}
	var height = 1.0;
	if (min.y < max.y) {
		height = max.y - min.y + 1.0;
	}
	svg.setAttribute("width", Math.ceil(width * 40) + "px");
	svg.setAttribute("height", Math.ceil(height * 40) + "px");

	svg.setAttribute("viewBox", "0 0 " + width + " " + height);
	svg.setAttribute("style", "background:#eee");

	var dYarn = "";

	this.yarns.forEach(function(yarn){
		dYarn += "M";
		for (var segment = yarn.head; segment !== null; segment = segment.next) {
			var bed = segment.guide.bed;
			var pts = segment.guide.points;
			if (segment.direction === '-') {
				pts = pts.slice();
				pts.reverse();
			}
			pts.forEach(function(p, i){
				var v = {
					x:p.x + bed.x,
					y:p.y + bed.y,
					z:p.z + bed.z
				};
				v.x = v.x - min.x + 0.5;
				v.y = height - (v.y - min.y + 0.5);
				dYarn += " ";
				dYarn += v.x.toFixed(2) + " " + v.y.toFixed(2);
			});
		}
	});
	var path = document.createElementNS(svgNS, 'path');
	path.setAttribute("style", "stroke-width:0.05;stroke:#f00;fill:none;");
	path.setAttribute("d", dYarn);
	svg.appendChild(path);

	return svg;
};

//replace the element 'toReplace' in the document with an interactive visualization of the knitout code in 'codeText':
function replaceElement(toReplace, codeText) {
	var container = document.createElement('div');
	container.classList.add("knitout");

	var code = document.createElement('code');
	container.appendChild(code);


	//TODO: nice syntax highlighting?
	var machine = new RecordMachine();

	parseKnitout(codeText, machine);

	var picture = document.createElement('div');
	picture.appendChild(machine.drawStacks());

	container.appendChild(picture);


	toReplace.replaceWith(container);
}

//find blocks of <pre><code class="knitout"> ... </code></pre>, and pass to replaceElement:
function init() {
	var elts = document.getElementsByClassName("knitout");
	for (var i = 0; i < elts.length; ++i) {
		var elt = elts[i];
		if (elt.tagName !== 'CODE') continue;
		var p = elt.parentNode;
		if (!p || p.tagName !== 'PRE') continue;
		if (elt.previousSibling !== null || elt.nextSibling !== null) {
			console.log("Skipping <pre><code class=\"knitout\"> block with nodes between <pre> and <code> tags.");
			continue;
		}
		if (elt.children.length !== 0) {
			console.log("Skipping <pre><code class=\"knitout\"> block with inner HTML.");
			continue;
		}
		console.log("Will do element:",elt);

		replaceElement(elt.parentNode, elt.innerText);
	}

}

init();


/*})(); */
