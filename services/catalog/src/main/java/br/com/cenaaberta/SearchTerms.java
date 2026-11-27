package br.com.cenaaberta;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Executors;
import java.util.function.Function;
import java.util.regex.Pattern;

/**
 * Regras da busca tolerante: o termo digitado vira uma forma limpa (sem espaços sobrando), uma forma
 * dobrada (sem acentos, em minúsculas) e, quando nada é encontrado, pedaços curtos para achar nomes
 * parecidos com o que foi digitado errado. A semelhança compara palavra por palavra.
 */
final class SearchTerms {

    /** Semelhança mínima (0 a 1) para um nome entrar como resultado aproximado. */
    static final double MIN_SIMILARITY = 0.7;

    private static final Pattern SPACES = Pattern.compile("\\s+");
    private static final Pattern NOT_WORD = Pattern.compile("[^\\p{L}\\p{N}]+");

    private SearchTerms() {}

    /** Tira espaços das pontas e troca espaços repetidos (inclusive tab e quebra de linha) por um só. */
    static String clean(String query) {
        return SPACES.matcher(query == null ? "" : query).replaceAll(" ").strip();
    }

    /** Forma limpa sem acentos e em minúsculas: "  Ação   Total " vira "acao total". */
    static String fold(String text) {
        return clean(TmdbMapper.normalize(text == null ? "" : text));
    }

    /** Palavras de um texto dobrado, sem pontuação. */
    static List<String> words(String text) {
        return Arrays.stream(NOT_WORD.split(fold(text))).filter(word -> !word.isEmpty()).toList();
    }

    /** Palavras curtas e comuns que sozinhas trazem resultado demais e não ajudam a achar o nome. */
    private static final Set<String> STOP_WORDS = Set.of("de", "da", "do", "das", "dos", "the", "and", "uma", "um", "of", "em", "no", "na", "os", "as");

    /** Máximo de consultas extras ao TMDB numa busca aproximada. */
    static final int MAX_ATTEMPTS = 16;

    /**
     * Consultas da busca aproximada, da mais provável para a menos. O TMDB só acha palavra inteira ou começo de
     * palavra, então os pedaços são: cada palavra sozinha ("chefao", "keanu", "bad"); o começo das palavras mais longas
     * ("brea" de "breaking"); e, quando o termo é uma palavra só, a palavra sem uma letra dobrada ("narutto" vira
     * "naruto") ou com duas letras vizinhas trocadas ("intersetelar" vira "interestelar").
     */
    static List<String> attempts(String query) {
        String folded = fold(query);
        var words = words(query).stream()
            .filter(word -> word.length() >= 3 && !STOP_WORDS.contains(word))
            .distinct()
            .sorted(Comparator.comparingInt(String::length).reversed())
            .toList();
        var out = new LinkedHashSet<String>();
        var shortest = new LinkedHashSet<String>();
        words.stream().limit(3).forEach(out::add);
        for (String word : words.stream().limit(2).toList()) {
            if (word.length() < 4) continue;
            out.add(word.substring(0, Math.max(3, (int) Math.ceil(word.length() * 0.6))));
            shortest.add(word.substring(0, 3));
        }
        if (words.size() == 1 && words.getFirst().length() >= 5 && words.getFirst().length() <= 14) {
            String word = words.getFirst();
            for (int i = 0; i + 1 < word.length(); i++)
                if (word.charAt(i) == word.charAt(i + 1)) out.add(word.substring(0, i) + word.substring(i + 1));
            for (int i = 0; i + 1 < word.length(); i++) {
                if (word.charAt(i) == word.charAt(i + 1)) continue;
                char[] letters = word.toCharArray();
                char swap = letters[i]; letters[i] = letters[i + 1]; letters[i + 1] = swap;
                out.add(new String(letters));
            }
        }
        // O começo de 3 letras traz muito resultado; fica por último.
        out.addAll(shortest);
        out.remove(folded);
        return out.stream().limit(MAX_ATTEMPTS).toList();
    }

    /**
     * O quanto um nome se parece com o termo (0 a 1): para cada palavra digitada, a palavra mais parecida do nome;
     * a nota é a média pesada pelo tamanho de cada palavra digitada, para uma palavra curta certa não esconder uma
     * longa errada. Palavra do nome que começa com a palavra digitada conta como igual.
     * @param names nomes da obra ou da pessoa (ex.: nome em português e original); vale o mais parecido
     */
    static double similarity(String query, String... names) {
        var typed = words(query);
        if (typed.isEmpty()) return 0;
        double best = 0;
        for (String name : names) {
            var candidate = words(name);
            if (candidate.isEmpty()) continue;
            double total = 0, weight = 0;
            for (String word : typed) {
                double closest = 0;
                for (String other : candidate) closest = Math.max(closest, other.startsWith(word) ? 1 : ratio(word, other));
                total += closest * word.length();
                weight += word.length();
            }
            best = Math.max(best, total / weight);
        }
        return best;
    }

    /**
     * 1 menos a distância de edição dividida pelo tamanho da palavra maior. A distância conta inserção, remoção,
     * troca de letra e duas letras vizinhas invertidas como 1 erro cada ("matirx" está a 1 erro de "matrix").
     */
    static double ratio(String a, String b) {
        if (a.equals(b)) return 1;
        int[][] d = new int[a.length() + 1][b.length() + 1];
        for (int i = 0; i <= a.length(); i++) d[i][0] = i;
        for (int j = 0; j <= b.length(); j++) d[0][j] = j;
        for (int i = 1; i <= a.length(); i++)
            for (int j = 1; j <= b.length(); j++) {
                int cost = a.charAt(i - 1) == b.charAt(j - 1) ? 0 : 1;
                d[i][j] = Math.min(Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + cost);
                if (i > 1 && j > 1 && a.charAt(i - 1) == b.charAt(j - 2) && a.charAt(i - 2) == b.charAt(j - 1))
                    d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            }
        return 1 - (double) d[a.length()][b.length()] / Math.max(a.length(), b.length());
    }

    /** Consultas feitas ao mesmo tempo em cada rodada da busca aproximada. */
    static final int BATCH = 4;

    /**
     * Roda as tentativas em rodadas de {@link #BATCH} consultas simultâneas, na ordem de {@link #attempts}, e para
     * na primeira rodada que achar algo parecido. Tentativa que falha (TMDB fora, limite de consultas) conta como vazia.
     * @param fetch busca uma tentativa no TMDB
     * @param closest filtra e ordena os candidatos juntados até aqui
     */
    static <T> List<T> firstClose(List<String> attempts, Function<String, List<T>> fetch, Function<List<T>, List<T>> closest) {
        var candidates = new ArrayList<T>();
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            for (int start = 0; start < attempts.size(); start += BATCH) {
                var round = attempts.subList(start, Math.min(start + BATCH, attempts.size())).stream()
                    .map(attempt -> executor.submit(() -> fetch.apply(attempt))).toList();
                for (var future : round) {
                    try { candidates.addAll(future.get()); }
                    catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); return List.of(); }
                    catch (ExecutionException failed) { /* tentativa sem resposta conta como vazia */ }
                }
                var close = closest.apply(candidates);
                if (!close.isEmpty()) return close;
            }
        }
        return List.of();
    }
}
