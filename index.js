'use strict'

function currentScrollTop() {
    return (window.pageYOffset || document.documentElement.scrollTop) 
            - 
           (document.documentElement.clientTop || 0);
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
    {
        content: 'Born',
        date: 'March 1994'
    },
    {
        content: 'High school graduation',
        date: 'March 2011'
    },
    {
        content: 'Internship at IBM',
        date: 'June 2014'
    },
    {
        content: 'College graduation',
        date: 'July 2015'
    },
    {
        content: 'Joined PayPal Inc',
        date: 'July 2015'
    }
];
var colors = ['#2196f3', '#fafafa'];
var titles = ['', 'ABOUT ME', 'SKILLS', 'TIMELINE', 'WEB PRESENCE'];

var timedot = document.getElementsByClassName('timedot')[0];
var ev_name = document.getElementsByClassName('event-name')[0];

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

var scroll$ = Rx.Observable.fromEvent(document, 'scroll').map(currentScrollTop).startWith(currentScrollTop());
var titles$ = Rx.Observable.merge(
    ...[].map.call(q('.section'), (div, ind) => {
        return scroll$.filter((top) => {
            return div.offsetTop <= top && (top < (div.offsetTop + div.clientHeight))
        }).map(() => {
            return {
                title: titles[ind],
                color: colors[ind % 2],
                opacity: 1 - (currentScrollTop() - div.offsetTop) / div.clientHeight
            }
        })
    })).subscribe((title) => {
    var header = document.getElementsByClassName('headers')[0];
    header.innerHTML = title.title;
    header.style.color = title.color;
    header.style.opacity = title.opacity;
    header.style.transform = 'scale(' + title.opacity + ')';
});