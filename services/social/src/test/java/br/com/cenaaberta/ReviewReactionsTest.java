package br.com.cenaaberta;

import java.util.*;

import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

import static br.com.cenaaberta.TestDatabase.fails;
import static org.junit.jupiter.api.Assertions.*;

class ReviewReactionsTest {
    static final String ANA="ana-12345678",BIA="bia-12345678",CAIO="caio-12345678",TITLE="demo-a";
    JdbcTemplate db; ReviewReactions service; Community social;

    @BeforeEach void setup() {
        db=TestDatabase.migrated();
        for(String actor:List.of(ANA,BIA,CAIO)) TestDatabase.profile(db,actor);
        db.update("insert into library(actor,title,watched,rating,review,evaluation_public) values(?,?,true,8,'Resenha da Bia',true)",BIA,TITLE);
        var actors=new ActiveActors(db);
        service=new ReviewReactions(db,actors);
        social=new Community(db,actors,new LibraryEntries(db,id -> "movie"));
    }

    @Test void likeUnlikeAndCountsInReviews() {
        assertEquals(Map.of("likes",1,"liked",true),service.like(ANA,TITLE,new ReviewReactions.LikeInput("bia",true)));
        assertEquals(Map.of("likes",1,"liked",true),service.like(ANA,TITLE,new ReviewReactions.LikeInput("bia",true)));
        service.like(CAIO,TITLE,new ReviewReactions.LikeInput("bia",true));
        var review=social.reviews(ANA,TITLE).getFirst();
        assertEquals(2L,((Number)review.get("likes")).longValue()); assertEquals(true,review.get("liked"));
        assertEquals(Map.of("likes",1,"liked",false),service.like(ANA,TITLE,new ReviewReactions.LikeInput("bia",false)));
        assertEquals(false,social.reviews(ANA,TITLE).getFirst().get("liked"));
    }

    @Test void likeRules() {
        fails(403,() -> service.like(BIA,TITLE,new ReviewReactions.LikeInput("bia",true)));
        fails(400,() -> service.like(ANA,TITLE,new ReviewReactions.LikeInput("bia",null)));
        fails(404,() -> service.like(ANA,"demo-b",new ReviewReactions.LikeInput("bia",true)));
        db.update("update library set evaluation_public=false");
        fails(404,() -> service.like(ANA,TITLE,new ReviewReactions.LikeInput("bia",true)));
    }

    @Test void commentListAndDeletePermissions() {
        var comment=service.comment(ANA,TITLE,new ReviewReactions.CommentInput("bia","  Concordo!  "));
        assertEquals("Concordo!",comment.get("body")); assertEquals(true,comment.get("mine")); assertEquals(true,comment.get("canDelete"));
        service.comment(CAIO,TITLE,new ReviewReactions.CommentInput("bia","Eu não"));
        var list=service.comments(BIA,TITLE,"bia");
        assertEquals(2L,list.get("total"));
        var items=(List<Map<String,Object>>)list.get("items");
        assertEquals("Concordo!",items.getFirst().get("body"));
        assertEquals(false,items.getFirst().get("mine")); assertEquals(true,items.getFirst().get("canDelete"));
        assertEquals(2L,((Number)social.reviews(CAIO,TITLE).getFirst().get("comments")).longValue());
        String id=(String)comment.get("id");
        fails(403,() -> service.deleteComment(CAIO,TITLE,id));
        fails(404,() -> service.deleteComment(ANA,"demo-b",id));
        assertEquals(true,service.deleteComment(BIA,TITLE,id).get("deleted"));
        fails(404,() -> service.deleteComment(ANA,TITLE,id));
    }

    @Test void commentLimitsAndPrivateReview() {
        fails(400,() -> service.comment(ANA,TITLE,new ReviewReactions.CommentInput("bia"," ")));
        fails(400,() -> service.comment(ANA,TITLE,new ReviewReactions.CommentInput("bia","x".repeat(1001))));
        assertNotNull(service.comment(ANA,TITLE,new ReviewReactions.CommentInput("bia","x".repeat(1000))).get("id"));
        db.update("update library set hidden=true");
        fails(404,() -> service.comments(ANA,TITLE,"bia"));
        db.update("update profile set active=false where actor=?",ANA);
        fails(403,() -> service.comment(ANA,TITLE,new ReviewReactions.CommentInput("bia","oi")));
    }
}
