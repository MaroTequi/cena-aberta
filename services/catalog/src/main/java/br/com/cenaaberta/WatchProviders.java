package br.com.cenaaberta;

import java.util.List;

import org.springframework.web.bind.annotation.*;

/** Onde assistir: serviços de streaming do Brasil e a disponibilidade de cada obra. */
@RestController
public class WatchProviders {

    private final StreamingAvailability availability;

    WatchProviders(StreamingAvailability availability) { this.availability = availability; }

    /** Serviços de streaming oferecidos no Brasil, para o usuário marcar os que assina. */
    @GetMapping("/providers")
    List<StreamingAvailability.Provider> providers() { return availability.providers(); }

    /** Onde um filme ou série pode ser assistido no Brasil. */
    @GetMapping("/titles/{id}/providers")
    StreamingAvailability.Availability title(@PathVariable String id) { return availability.of(id); }
}
