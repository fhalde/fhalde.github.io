'use strict'

function q(name) {
    if (name[0] == '#') {
        return document.getElementById(name.substring(1));
    }
    if (name[0] == '.') {
        return document.getElementsByClassName(name.substring(1));
    }
}

function mk(tag) {
    var command = new Object();
    command.node = document.createElement(tag);
    command.class = function(name) {
        command.node.className = name;
        return command;
    };
    command.onmouseover = function(i) {
        command.node.onmouseover = function(e) {
            ev_name.innerHTML = events[i].content + '<br /><span style=\'font-size: 18px\'>' + events[i].date + '</span>';
            ev_name.style.opacity = 1;
        };
        command.node.onmouseout = function(e) {
            ev_name.style.opacity = 0;
        }
        return command;
    }
    command.append = function(node) {
        node.appendChild(command.node);
        return command;
    }
    return command;
}

var events = [
    { content: 'Born', date: 'March 1994' },
    { content: 'High school graduation', date: 'March 2011' },
    { content: 'Internship at IBM', date: 'June 2014' },
    { content: 'College graduation', date: 'July 2015' },
    { content: 'Joined PayPal Inc', date: 'July 2015' }
];
var timedot = q('.timedot')[0];
var ev_name = q('.event-name')[0];

! function createTimeline() {
    if (events.length == 0) {
        return;
    }
    for (var i = 0; i < events.length - 1; i++) {
        mk('div').class('circles').onmouseover(i).append(timedot);
        mk('div').class('lines').append(timedot);
    }
    mk('div').class('circles').onmouseover(i).append(timedot);
}();


var colors = ['#2196f3', '#fafafa'];
var titles = ['', 'ABOUT ME', 'SKILLS', 'TIMELINE', 'WEB PRESENCE'];
var divs = q('.section');

! function changeHeaderOnScroll() {
    var header = q('.headers')[0];
    document.addEventListener('scroll', function(e) {
        var doc = document.documentElement;
        var scrollTop = window.pageYOffset || doc.scrollTop;
        var top = scrollTop - (doc.clientTop || 0);
        for (var elem in divs) {
            var node = divs[elem];
            if (top < (node.offsetTop + node.clientHeight)) {
                header.innerHTML = titles[elem];
                header.style.color = colors[parseInt(elem) % 2];
                var factor = 1 - ((scrollTop - node.offsetTop) / node.clientHeight);
                header.style.opacity = factor;
                header.style.transform = 'scale(' + factor + ')';
                break;
            }
        }
    });
}();
