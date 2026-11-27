package br.com.cenaaberta;
import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
class InternalKeyFilterTest {
 static final String SECRET="s".repeat(24);
 final InternalKeyFilter filter=new InternalKeyFilter(SECRET);
 MockHttpServletResponse call(String path,String key,MockFilterChain chain)throws Exception{
  var request=new MockHttpServletRequest("GET",path);request.setRequestURI(path);
  if(key!=null)request.addHeader("X-Internal-Key",key);
  var response=new MockHttpServletResponse();filter.doFilter(request,response,chain);return response;
 }
 @Test void shouldLetHealthPassWithoutKey()throws Exception{var chain=new MockFilterChain();call("/health",null,chain);assertNotNull(chain.getRequest());}
 @Test void shouldReturn401WithTheOldMessageWhenKeyIsMissing()throws Exception{var chain=new MockFilterChain();var response=call("/titles",null,chain);assertEquals(401,response.getStatus());assertEquals("401 UNAUTHORIZED",response.getErrorMessage());assertNull(chain.getRequest());}
 @Test void shouldReturn401WhenKeyIsWrong()throws Exception{var chain=new MockFilterChain();assertEquals(401,call("/titles","y".repeat(24),chain).getStatus());assertNull(chain.getRequest());}
 @Test void shouldLetCorrectKeyPass()throws Exception{var chain=new MockFilterChain();assertEquals(200,call("/titles",SECRET,chain).getStatus());assertNotNull(chain.getRequest());}
 @Test void shouldProtectAnyNewPath()throws Exception{var chain=new MockFilterChain();assertEquals(401,call("/qualquer/rota/nova",null,chain).getStatus());assertNull(chain.getRequest());}
 @Test void shouldRejectShortSecret(){assertEquals("INTERNAL_SECRET precisa de pelo menos 24 caracteres",assertThrows(IllegalArgumentException.class,()->new InternalKeyFilter("x".repeat(23))).getMessage());}
 @Test void shouldExemptOnlyTheExactHealthPath()throws Exception{for(String path:new String[]{"/healthz","/health/x","/health;x"}){var chain=new MockFilterChain();assertEquals(401,call(path,null,chain).getStatus(),path);assertNull(chain.getRequest(),path);}}
}
