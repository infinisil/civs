use POSIX qw(strftime);

$election_id = param('id');
$election_id =~ s/\.//g;
$election_id =~ s/\///g;

# set up filename paths

$election_dir = $home."/elections/".$election_id;
$started_file = $election_dir."/started";
$stopped_file = $election_dir."/stopped";
$election_data = $election_dir."/election_data";
$election_log = $election_dir."/vote_log";
$vote_data = $election_dir."/vote_data";
$election_lock = $election_dir."/lock";

# open databases

$db = tie %edata, "DB_File", $election_data, O_RDWR, 0666, $DB_HASH;
$vdb = tie %vdata, "DB_File", $vote_data, O_CREAT|O_RDWR, 0666, $DB_HASH;

# extract data from databases

$name = $edata{'name'};
$title = $edata{'title'};
$email_addr = $edata{'email_addr'};
$description = $edata{'description'};
$num_winners = $edata{'num_winners'};
$addresses = $edata{'addresses'};
@addresses = split /[\r\n]+/, $addresses;
$election_end = $edata{'election_end'};
$public = $edata{'public'};
$writeins = $edata{'writeins'};
$proportional = $edata{'proportional'};
$use_combined_weights = $edata{'use_combined_weights'};
$choices = $edata{'choices'};
@choices = split /[\r\n]+/, $choices;
$num_choices = $#choices + 1;
$num_auth = $edata{'num_auth'};
$num_votes = $vdata{'num_votes'};
$recorded_voters = $vdata{'recorded_voters'};
$ballot_reporting = $edata{'ballot_reporting'};

# utility routines

sub ExtractVoterKeys {
    my $s = $edata{'voter_keys'};
    my @a = split /[\r\n]+/, $s;
    my $k;
    foreach $k (@a) {
	$voter_keys{$k} = 1;
    }
}

ExtractVoterKeys;

sub SaveVoterKeys {
    my $s = '';
    my $k;
    foreach $k (keys %voter_keys) {
	$s .= ($k.$cr);
    }
    $edata{'voter_keys'} = $s;
}

sub LockElection {
    if (!sysopen(ELOCK, $lockfile, O_CREAT|O_RDWR)) {
	print h1("Error");
	print p("Did not have write access to acquire an election lock"), 
	      end_html();
	exit 0;
    }
    flock ELOCK, LOCK_EX;
}
sub UnlockElection {
    flock ELOCK, LOCK_UN;
    close(ELOCK);
}

sub StartElection {
    if (sysopen(STARTED, $started_file, O_RDONLY)) {
	print h1("Error");
	print p("This election ($title) has already been started"), end_html();
	exit 0;
    }
    if (sysopen(STARTED, $started_file, O_CREAT|O_EXCL)) {
	print STARTED "started\n";
	close(STARTED);
    } else {
	print h1("Error");
	print p("Did not have write access to start an election"), end_html();
	exit 0;
    }
}

sub IsStarted {
    if (!open(STARTED, $started_file)) {
	return 0;
    } else {
	return 1;
    }
}

sub CheckStarted {
    if (!IsStarted()) {
	print h1("Error");
	print p("This election does not exist or has not been started"), end_html();
	exit 0;
    }
}

sub PointToResults {
    if ($public eq 'no') {
	print "<p>The following URL will report the results of the election once\n";
	print "it is complete:<br>\n";
    } else {
	print "<p>The following URL reports the current results of the election:<br>\n";
    }
    print "<a href=\"http://$thishost$civs_bin_path/results?id=$election_id\">
    <tt>http://$thishost$civs_bin_path/results?id=$election_id</tt></a></p>\n";
}
sub PointToResultsComplete {
    print "<p>The following web page has the results of this completed election:<br>\n";
    print "<a href=\"http://$thishost$civs_bin_path/results?id=$election_id\">
       <tt>http://$thishost$civs_bin_path/results?id=$election_id</tt></a></p>\n";
}

sub IsStopped {
    if (open(STOPPED, $stopped_file)) {
	close(STOPPED);
	return 1;
    } else {
	return 0;
    }
}
sub CheckNotStopped {
    if (IsStopped()) {
	print h1("Election already closed");
	print p("This election (<strong>$title</strong>) has already been closed.");
	PointToResultsComplete;
	print end_html();
	exit 0;
    }
}

sub CheckStopped {
    if (!IsStopped() && (!$localdebug)) {
	print h1("Election not yet closed");
	print p(
"This election (<strong>$title</strong>) has not yet been closed
by its supervisor, $name (<tt>$email_addr</tt>).
The election has been announced to end $election_end.");
	PointToResults;
	print end_html();
	exit 0;
    }
}

sub CheckVoterKey {
    if ($private_host_id eq '') {
	GetPrivateHostID;
    }
    if ($voter_key eq '' && $old_voter_key ne '') {
	$voter_key_check = substr(md5_hex("voter".$private_host_id.$election_id.$voter), 0, 16);
	if ($voter_key_check ne $old_voter_key) {
	    Log("Invalid voter key $old_voter_key presented by $voter for election $election_id, expected $voter_key_check");
	    print h1("Error"), p("Your voter key is invalid, $voter. You should have received a correct URL by email."), end_html();
	    exit 0;
	}
    } else {
	if (!$voter_keys{$voter_key}) {
	    print h1("Error"), p("Your voter key is invalid.
	    You should have received a correct URL by email."), end_html();
	    exit 0;
	}
    }
}

sub CheckNotVoted {
    if ($vdata{$voter_key} ne '') {
	print h1("Already voted");
	print p("A vote has already been cast using your voter key.");
	PointToResults;
	print end_html();
	ElectionLog("Election: $title ($election_id) : Saw second vote from voter $voter, voter key $voter_key");
	exit 0;
    }
}

sub CheckControlKey {
    GetPrivateHostID;
    $control_key = param('key');
    $control_key_check = substr(md5_hex("control".$private_host_id.$election_id), 0, 16);
    if ($control_key ne $control_key_check) {
	print h1("Error"), p("Invalid key. You should have received a correct URL for controlling the election by email. This error has been logged.");
	print end_html();
	ElectionLog("Election: $title ($election_id) : invalid attempt to close election (wrong key)");
	exit 0;
    }
}

sub IsWellFormedElectionID {
    return $election_id =~ m/^E_[0123456789abcdef]+/;
}

sub CheckElectionID {
    if (!IsWellFormedElectionID) {
	if ($election_id ne '') {
	    print h1("Invalid election identifier");
	    print p("The election identifier \"$election_id\" is not valid.\n");
	    Log("Attempt to provide a bogus election identifier: \"$election_id\"");
	    $election_id = '';
	}
	print end_html();
	exit 0;
    }
}

# Log the string provided
sub ElectionLog {
    $log_msg = shift;
    chomp($log_msg);
    $now = strftime "%a %b %e %H:%M:%S %Y", localtime;
    if (!open ELECTION_LOG, ">>$election_log") {
        print h1("Error"),
	      p("Unable to append to the election log."),
	      end_html();
	exit 0;
    }
    print ELECTION_LOG $now." ".remote_addr()." ".$log_msg."\n";
    close ELECTION_LOG;
}

# Construct new voter keys for all of the voters sent in @_.
# Send all of the voters their keys, with logging to STDOUT.
# And record the keys in the database.
sub SendKeys {
    if (!($local_debug)) { ConnectMail; }
    my @addresses = @_;
    my $v, $voter_key, $url;
    foreach $v (@_) {
	$voter_key = SecureNonce();
	$voter_keys{$voter_key} = 1;
	$url =
	"http://$thishost$civs_bin_path/vote?id=$election_id&key=$voter_key";
	if ($local_debug) {
	    print "voter link: <a href=\"$url\">$url</a>\n";
	} else {
	    print "Sending mail to voter \"$v\"...\n"; STDOUT->flush();
	    Send "mail from: $email_addr"; ConsumeSMTP;
	    Send "rcpt to: $v"; ConsumeSMTP;
	    Send "data"; ConsumeSMTP;
	    Send "From: $email_addr (Condorcet Internet Voting Service)";
	    Send "To: $v";
	    Send "Subject: CIVS Election now available for voting: $title";
	    Send "";
	    Send "A Condorcet Internet Voting Service election named $title has been created.";
	    Send "You have been designated as a voter by the election supervisor,";
	    Send "$name ($email_addr). If you would like to vote, please visit the";
	    Send "following URL:";
	    Send "";
	    Send "$url";
	    Send "";
	    Send "This is your private URL. Do not give it to anyone else because";
	    Send "they could use it to vote for you. Your privacy will not be violated";
	    Send "by voting. The voting service does not keep track of your email address";
	    Send "or release any information about whether or how you have voted.";
	    Send "";
	    Send "The election has been announced to end $election_end.";
	    Send "To view the results of the election once it is closed, visit:";
	    Send "http://$thishost$civs_bin_path/results?id=$election_id";
	    Send "";
	    Send "For more information about the Condorcet Internet Voting Service, see";
	    Send "http://$thishost$civs_url.";
	    Send "."; ConsumeSMTP;
	}
    }
    SaveVoterKeys;

    if (!($local_debug)) {
	Send "quit";
	close(SMTP);
    }
    print "Done.$cr</pre>$cr";
}

1; # ok!
