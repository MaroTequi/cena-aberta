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
 @Test void healthPassesWithoutKey()throws Exception{var chain=new MockFilterChain();call("/health",null,chain);assertNotNull(chain.getRequest());}
 @Test void missingKeyIs401()throws Exception{var chain=new MockFilterChain();assertEquals(401,call("/me",null,chain).getStatus());assertNull(chain.getRequest());}
 @Test void wrongKeyIs401()throws Exception{var chain=new MockFilterChain();assertEquals(401,call("/me","y".repeat(24),chain).getStatus());assertNull(chain.getRequest());}
 @Test void correctKeyPasses()throws Exception{var chain=new MockFilterChain();assertEquals(200,call("/me",SECRET,chain).getStatus());assertNotNull(chain.getRequest());}
 @Test void anyNewPathIsProtected()throws Exception{var chain=new MockFilterChain();assertEquals(401,call("/qualquer/rota/nova",null,chain).getStatus());assertNull(chain.getRequest());}
 @Test void shortSecretIsRejected(){assertThrows(IllegalArgumentException.class,()->new InternalKeyFilter("curta"));}
 @Test void healthExemptionIsExactPath()throws Exception{for(String path:new String[]{"/healthz","/health/x","/health;x"}){var chain=new MockFilterChain();assertEquals(401,call(path,null,chain).getStatus(),path);assertNull(chain.getRequest(),path);}}
}
