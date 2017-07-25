console.log("Hello from knitout-viz");
//protect rest of document from spurious variables:
/*DEBUG, don't: (function(){ */

//parseKnitout will parse knitout, catch syntax errors, and dispatch to calls on 'machine', an abstract knitting machine:
function parseKnitout(codeText, machine) {
	var errors = [];
	var warnings = [];

	var carrierNames = [];

	var inCommentHeader = true;
	
	codeText.split("\n").forEach(function(line, lineNumber) {
		function addError(info) {
			console.log("Parse Error on line " + lineNumber + ": " + info);
			errors.push({lineNumber:lineNumber, text:info});
		}
		function addWarning(info) {
			console.log("Parse Warning on line " + lineNumber + ": " + info);
			warnings.push({lineNumber:lineNumber, text:info});
		}

		//comment header -- TODO

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

		//does the line look like a comment header line?
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

		//TODO: handle !source: directive in comment?

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
			return tokens.splice();
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
			} else if (op === "split") {
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
				console.log(e); //DEBUG
			}
		}

	});
}

//RecordMachine is an abstract knitting machine that records the loop structure of a knitout document:

function RecordMachine() {
	//name -> carriers map starts empty:
	this.carriers = {};
	//bed starts empty:
	this.needles = {};
	//beds start aligned:
	this.racking = 0.0;
	//stitch values start zeroed:
	this.stitchValues = [0.0, 0.0];
}

//set the carriers in front-to-back order; carriers start out of action at the right:
RecordMachine.prototype.setCarriers = function(cs) {
	this.carriers = {};
	cs.forEach(function(n){
		this.carriers[n] = {
			at:-Infinity
			// last: <-- if has knit
			// mark: <-- if marked to come in at next use
		};
	}, this);
};

//helper to split needle into bed, slider, index:
function parseNeedle(n) {
	var m = n.match(/^([fb])(s?)([-+]?\d+)$/);
	console.assert(m !== null, "needle should always be parseable");
	return {
		bed:match[1],
		slider:(match[2] === "s"),
		index:parseInt(match[3])
	};
}

//helper to compute locs (front-bed-relative world positions) based on [direction +] needle :
RecordMachine.prototype.atLoc = function(n) {
	var m = n.match(/^([fb])(s?)([-+]?\d+)$/);
	console.assert(m !== null, "needle should always be parseable");
	var loc = parseInt(m[3]);
	if (m[1] === "b") {
		loc -= this.racking;
	}
	return loc;
};
RecordMachine.prototype.beforeLoc = function(d, n) {
	var loc = this.atLoc(n);
	if (d === '+') {
		loc -= 1.0 / 16.0;
	} else { console.assert(d === '-', "directions should only be +/-");
		loc += 1.0 / 16.0;
	}
	return ;
};
RecordMachine.prototype.afterLoc = function(d, n) {
	var loc = this.atLoc(n);
	if (d === '+') {
		loc += 1.0 / 16.0;
	} else { console.assert(d === '-', "directions should only be +/-");
		loc -= 1.0 / 16.0;
	}
	return ;
};


RecordMachine.prototype.markIn = function(cs, hook) {
	//check parameters:
	cs.forEach(function(cn){
		if (!(cn in this.carriers)) throw "Carrier name [" + cn + "] not in carrier list.";
		var c = this.carriers[cn];
		if (c.last) throw "Carrier [" + cn + "] is already in action.";
		if (c.hook) throw "Carrier [" + cn + "] is already in a holding hook.";
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
		if (!c.last) needIn = true;
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
	var at = this.beforeLoc(d, n);

	//move carriers, remove mark:
	cs.forEach(function(cn){
		var c = this.carriers[cn];
		c.at = at;
		delete c.mark;
	}, this);

	//create a new holding hook, if needed:
	if (mark.hook) {
		var hook = {
			at:at,
			cs:cs.slice()
		};
		cs.forEach(function(n){
			this.carriers[n].hook = hook;
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
		c.at = -Infinity;
		delete c.last;
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
RecordMachine.prototype.knit = function(d, n, cs) {
	//bring in carriers if needed:
	this.bringInIfNeeded(d, n, cs);

	//TODO: kick other carriers
	//TODO: move carriers (might make yarn overlaps?)
	//TODO: add stitch block to diagram
/*
	var bsi = parseNeedle(n);

	//record stitch:
	var stitch = {
		type:'k',
		created:needle, //or figuring out the direction it is through 'through'
		loopsIn:null, //what loops is it through? (needle order)
	};
	if (n in this.needles) {
		stitch.through = this.needles[n];
	}
	this.needles[n] = stitch;
	*/

};
RecordMachine.prototype.tuck = function(d, n, cs) {
};
RecordMachine.prototype.split = function(d, n, n2, cs) {
};
RecordMachine.prototype.miss = function(d, n, cs) {
};
RecordMachine.prototype.pause = function() {
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

	var machine = document.createElement('div');
	container.appendChild(machine);

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
