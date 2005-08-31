var rows = new Array;
var rank = new Array;
var selected = new Array;
var preftable;			// the ballot table
var prefsection;		// the parent node of the rows (a section)
var num_choices;

var cur_top;
var cur_bot;

var num_selected;
var selected_list;
var num_at_rank = new Array;

// Move the element of a currently at index i so it is just
// before the element currently at index j, while keeping
// all other elements in the same relative order. if
// j=num_choices then the element is put at the end.
function move_elem_to(a, i, j) {
    if (i == j) return;
    //alert("moving " + i + " to " + j);
    var src = a[i];
    if (i < j) {
	// move elems from i+1 to j-1 up one
	for (var k=i; k < j-1; k++) a[k] = a[k+1];
	a[j-1] = src;
    } else {
	// move elems from j to i-1 down one
	for (var k=i; k > j; k--) a[k] = a[k-1];
	a[j] = src;
    }
}

// return true if a later row moved into the row
// that moved.
function resort_row(i) {
    // figure out where it goes (j)
    var j = 0;
    while (j < num_choices && (j == i || rank[j] < rank[i])) {
	j++;
    }
    if (i == j || i == j - 1) { // XXX is i==j test needed?
	//alert("no move needed for " + i);
	return false;
    }

    //alert("moving " + i + " to " + j);
    // fix UI
    if (j == num_choices) {
	prefsection.appendChild(rows[i]);
    } else {
	prefsection.insertBefore(rows[i], rows[j]);
    }

    // now fix rows, rank, and selected
    move_elem_to(rows, i, j);
    move_elem_to(rank, i, j);
    move_elem_to(selected, i, j);
    selected_list = null;

    return (i < j);
}

// stably sort rows by their rank
function sort_rows() {
    read_rows();
    //alert("sorting the rows of " + preftable);
    var permut = new Array;
    for (var i = 0; i < num_choices; i++) {
	permut[i] = i;
    }
    function compare(m,n) {
	if (rank[m] < rank[n]) return -1;
	if (rank[m] > rank[n]) return 1;
	if (m < n) return -1; // make it stable, please!
	if (m > n) return 1;
	return 0;
    }
    permut.sort(compare);
    diag = "";
    var newselected = new Array;
    for (var i = 0; i < permut.length; i++) {
	var j = permut[i];
	prefsection.appendChild(rows[j]);
	newselected[i] = selected[j];
	diag = diag + j;
    }
    selected = newselected;
    //alert("permutation: " + diag);
    read_rows();
}

// select the indicated row object. add is true
// if the user want to add to (or remove from)
// the current selection.
function select_row(row, add) {
    for (var i = 0; i < num_choices; i++) {
	if (!add) {
	    rows[i].className = null;
	    selected[i] = false;
	}
	if (rows[i] == row) {
	    selected[i] = !selected[i];
	    if (selected[i]) row.className = "selected";
	    else row.className = null;
	}
    }
}

function read_rows() {
    //alert("reading the rows, length = " + (preftable.rows.length - 1));
    for (var i = 0; i < num_choices; i++) {
	var row = rows[i] = preftable.rows[i+1];
	var s = row.getElementsByTagName("select")[0];
	rank[i] = s.selectedIndex + 1;
    }
}

function scan_ranks() {
    var i;
    for (i = 1; i <= num_choices+1; i++) num_at_rank[i] = 0;
    for (i = 0; i < num_choices; i++) num_at_rank[rank[i]]++;
}

// minimum of ranks of selected items
// effect: updates num_selected, selected_list
function min_selected_rank() {
    var cur = num_choices + 1;
    num_selected = 0;
    selected_list = new Array;
    for (var i = 0; i < num_choices; i++) {
	if (selected[i]) {
	    selected_list[num_selected++] = i;
	    if (rank[i] < cur) cur = rank[i];
	}
    }
    return cur;
}

// maximum of ranks of selected items
// effect: updates num_selected, selected_list
function max_selected_rank() {
    var cur = 1;
    num_selected = 0;
    selected_list = new Array;
    for (var i = 0; i < num_choices; i++) {
	if (selected[i]) {
	    selected_list[num_selected++] = i;
	    if (rank[i] > cur) cur = rank[i];
	}
    }
    return cur;
}

function num_sel_by_rank(r) {
    var c = 0;
    for (var i = 0; i < num_selected; i++) {
	if (rank[selected_list[i]] == r) c++;
    }
    return c;
}

// return true if it had to be moved
function set_rank(i, r) {
    //alert("Setting rank of " + i + " to " + r);
    if (rank[i] == r) return false;
    rank[i] = r;
    var s = rows[i].getElementsByTagName("select")[0];
    s.selectedIndex = r - 1;
    return resort_row(i);
}

function do_make_tie() {
    var min_rank = min_selected_rank();
    if (num_selected < 2) {
	alert("Not enough choices were selected. "+
	      "Shift-click to select two or more choices");
	return;
    }
    for (var i = 0; i < num_choices; i++) {
	if (selected[i])
	    if (set_rank(i, min_rank)) i--;
    }
}

function do_move_up () {
    var min_rank = min_selected_rank();
    if (num_selected < 1) {
	alert("No choices were selected. "+
	      "Click (or shift-click) to select choices");
	return;
    }
    if (min_rank == 1) return;
    scan_ranks();
    var nr = num_sel_by_rank(min_rank);
    var new_rank = min_rank - 1;
    var split = (num_at_rank[min_rank] > nr);
    if (!split) { // moving whole rank
	while (new_rank > 1 && !num_at_rank[new_rank])
	    new_rank--; // find prev full rank to jump past
	// should check here whether new_rank = num_choices
	// and do a "push up" if so.
    } else if (num_at_rank[new_rank]) {
	// an additional rank is being occupied and we
	// don't have a place to put it. Try shifting
	// others up first.
	var j = new_rank;
	//alert("trying to shift up");
	while (j >= 1 && num_at_rank[j]) j--;
	if (j >= 1) { // nothing at j: can shift up
	    for (var i = 0; i < num_choices; i++) {
		if (rank[i] > j && rank[i] <= new_rank)
		    set_rank(i, rank[i] - 1); // should not change position
	    }
	} else { // must shift down
	    new_rank++;
	    var j = new_rank;
	    //alert("shifting down");
	    while (j <= num_choices && num_at_rank[j]) j++;
		// note: don't shift choices down to "no opinion"
	    if (j <= num_choices) { // nothing at j: can shift down
		for (var i = num_choices; i >= 0; i--) {
		    if (rank[i] >= new_rank && rank[i] < j)
			set_rank(i, rank[i] + 1); // should not change posn
		}
	    }
	}
    }
    //alert("updating ranks");
    for (var i = 0; i < num_choices; i++) {
	if (selected[i]) {
	    if (set_rank(i, new_rank)) i--;
	}
	else if (!split && rank[i] == new_rank && new_rank < num_choices)
	    // we have an empty rank to push the old rank down to
	    if (set_rank(i, rank[i]+1)) i--;
    }
}

function do_move_down () {
    var max_rank = max_selected_rank();
    if (num_selected < 1) {
	alert("No choices were selected. "+
	      "Click (or shift-click) to select choices");
	return;
    }
    if (max_rank == num_choices + 1) return;
    var new_rank = max_rank + 1;
    scan_ranks();
    var nr = num_sel_by_rank(max_rank);
    var split = (num_at_rank[max_rank] > nr);
    if (!split) { // moving whole rank
	while (new_rank < num_choices && !num_at_rank[new_rank])
	    new_rank++; // find next full rank to jump past
    } else if (num_at_rank[new_rank]) {
	// an additional rank is being occupied and we
	// don't have a place to put it. Try shifting
	// others down first.
	var j = new_rank;
	//alert("trying to shift down");
	while (j <= num_choices && num_at_rank[j]) j++;
	if (j <= num_choices) { // nothing at j: can shift down
	    for (var i = num_choices-1; i >= 0; i--) {
		if (rank[i] < j && rank[i] >= new_rank)
		    set_rank(i, rank[i] + 1); // should not change position
	    }
	} else { // must shift up
	    new_rank--;
	    var j = new_rank;
	    //alert("shifting up");
	    while (j >= 1 && num_at_rank[j]) j--;
		// note: don't shift choices down to "no opinion"
	    if (j >= 1) { // nothing at j: can shift up
		for (var i = 0; i < num_choices; i++) {
		    if (rank[i] <= new_rank && rank[i] > j)
			set_rank(i, rank[i] - 1); // should not change posn
		}
	    }
	}
    }
    for (var i = 0; i < num_choices; i++) {
	if (selected[i]) {
	    if (set_rank(i, new_rank)) i--;
	} else if (!split && rank[i] == new_rank && new_rank > 1) {
	    if (set_rank(i, rank[i] - 1)) i--;
	}
    }
}

function do_move_top() {
    var min_rank = min_selected_rank();
    if (num_selected < 1) {
	alert("No choices were selected. "+
	      "Click (or shift-click) to select choices");
	return;
    }
    //if (min_rank <= cur_top)
    cur_top = 1;
    scan_ranks();
    var collision = num_at_rank[min_rank];
    for (var i = 0; i < num_choices; i++) {
	if (selected[i]) {
	    if (set_rank(i, cur_top)) i--;
	} else if (collision && rank[i] >= cur_top &&
		    rank[i] < min_rank &&
		    rank[i] < num_choices) {
	    set_rank(i, rank[i] + 1);
	}
    }
    cur_top++;
}
function do_move_bottom() {
    var max_rank = max_selected_rank();
    if (num_selected < 1) {
	alert("No choices were selected. "+
	      "Click (or shift-click) to select choices");
	return;
    }
    //if (max_rank >= cur_bot)
    cur_bot = num_choices;
    scan_ranks();
    var collision = num_at_rank[max_rank];
    for (var i = 0; i < num_choices; i++) {
	if (selected[i]) {
	    if (set_rank(i, cur_bot)) i--;
	} else if (collision && rank[i] <= cur_bot
			     && rank[i] > max_rank
			     && rank[i] > 1) {
	    set_rank(i, rank[i] - 1);
	}
    }
    cur_bot--;
}

function setup() {
    var button = document.getElementById("sort_button");
    button.parentNode.removeChild(button);
    var jshelp = document.getElementById("jshelp");
    var curtext = jshelp.childNodes[0];
    jshelp.removeChild(curtext);
    var jshelp_text = document.createTextNode(
    "As you assign ranks, the choices will remain sorted in rank order.  You may assign ranks using either the pulldowns in the Rank column or the buttons on the right-hand side.");
    jshelp.appendChild(jshelp_text);


    preftable = document.getElementById("preftable");
    prefsection = preftable.rows[0].parentNode;
    num_choices = preftable.rows.length - 1;

    document.CastVote.move_top.disabled = false;
    document.CastVote.move_up.disabled = false;
    document.CastVote.make_tie.disabled = false;
    document.CastVote.move_down.disabled = false;
    document.CastVote.move_bottom.disabled = false;

    cur_top = 1;
    cur_bot = num_choices;

    sort_rows();
}
