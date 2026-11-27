CREATE TABLE room_end_notice (
    room varchar(36) NOT NULL,
    recipient varchar(160) NOT NULL REFERENCES profile(actor) ON DELETE CASCADE,
    name varchar(80) NOT NULL,
    reason varchar(16) NOT NULL CHECK(reason IN ('expired','closedByHost','closedByLeave')),
    visible_at timestamp with time zone NOT NULL,
    seen boolean NOT NULL DEFAULT false,
    PRIMARY KEY(room,recipient)
);
CREATE INDEX room_end_inbox ON room_end_notice(recipient,seen,visible_at);
INSERT INTO room_end_notice(room,recipient,name,reason,visible_at)
SELECT r.id,m.actor,r.name,'expired',r.expires FROM movie_room r
JOIN movie_room_member m ON m.room=r.id WHERE r.expires>CURRENT_TIMESTAMP;
