# Скилл: Java разработка

## Назначение
Руководство по разработке на Java, включая Spring Boot, JPA/Hibernate и enterprise паттерны.

## Когда использовать
- Создание Spring Boot приложений
- Разработка REST API на Java
- Работа с JPA/Hibernate ORM
- Тестирование Java кода
- Настройка сборки (Maven/Gradle)

## Основы Java
```java
// Основы синтаксиса
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}

// Записи (Records) для DTO
public record UserDto(String id, String name, Integer maxId, String status) {}

// Stream API
List<String> names = users.stream()
    .filter(u -> u.status().equals("admin"))
    .map(UserDto::name)
    .toList();
```

## Spring Boot основы
```java
// Основное приложение
@SpringBootApplication
public class Application {
    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }
}

// REST контроллер
@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
public class UserController {
    
    private final UserService userService;
    
    @GetMapping
    public ResponseEntity<List<UserDto>> getAll() {
        return ResponseEntity.ok(userService.findAll());
    }
    
    @GetMapping("/{id}")
    public ResponseEntity<UserDto> getById(@PathVariable String id) {
        return userService.findById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }
    
    @PostMapping
    public ResponseEntity<UserDto> create(@RequestBody CreateUserRequest request) {
        UserDto created = userService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }
}
```

## JPA сущности
```java
@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
public class User {
    
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;
    
    @Column(nullable = false)
    private String name;
    
    @Column(unique = true)
    private Integer maxId;
    
    @Column
    private String password;
    
    @Column(nullable = false)
    private String status = "user";
    
    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();
    
    @Column(name = "updated_at")
    private LocalDateTime updatedAt = LocalDateTime.now();
}
```

## Spring Data репозитории
```java
@Repository
public interface UserRepository extends JpaRepository<User, String> {
    
    Optional<User> findByMaxId(Integer maxId);
    
    List<User> findByStatus(String status);
    
    @Query("SELECT u FROM User u WHERE u.name LIKE %:name%")
    List<User> searchByName(@Param("name") String name);
}
```

## Сервисы
```java
@Service
@RequiredArgsConstructor
@Transactional
public class UserService {
    
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    
    public List<UserDto> findAll() {
        return userRepository.findAll().stream()
            .map(this::toDto)
            .toList();
    }
    
    public Optional<UserDto> findById(String id) {
        return userRepository.findById(id).map(this::toDto);
    }
    
    public UserDto create(CreateUserRequest request) {
        User user = new User();
        user.setName(request.name());
        user.setPassword(passwordEncoder.encode(request.password()));
        return toDto(userRepository.save(user));
    }
    
    private UserDto toDto(User user) {
        return new UserDto(user.getId(), user.getName(), 
                          user.getMaxId(), user.getStatus());
    }
}
```

## Тестирование
```java
@SpringBootTest
@AutoConfigureMockMvc
class UserControllerTest {
    
    @Autowired
    private MockMvc mockMvc;
    
    @MockBean
    private UserService userService;
    
    @Test
    void shouldReturnUserWhenFound() throws Exception {
        UserDto user = new UserDto("1", "Test User", 123, "user");
        when(userService.findById("1")).thenReturn(Optional.of(user));
        
        mockMvc.perform(get("/api/users/1"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Test User"));
    }
}
```

## Конфигурация application.yml
```yaml
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/dbname
    username: ${DB_USER}
    password: ${DB_PASSWORD}
  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
    properties:
      hibernate:
        format_sql: true

server:
  port: 8081
  
logging:
  level:
    root: INFO
    com.example: DEBUG
```

## Maven зависимости
```xml
<!-- Spring Boot Starters -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-data-jpa</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-security</artifactId>
</dependency>
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-validation</artifactId>
</dependency>

<!-- Database -->
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <scope>runtime</scope>
</dependency>

<!-- Testing -->
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-test</artifactId>
    <scope>test</scope>
</dependency>
```

## Паттерны проектирования
```java
// Builder паттерн
@Builder
public class CreateUserRequest {
    private String name;
    private String password;
    private Integer maxId;
}

// Strategy паттерн
public interface ValidationStrategy {
    boolean validate(UserDto user);
}

// Observer паттерн
@Component
public class UserEventListener {
    @EventListener
    public void handleUserCreated(UserCreatedEvent event) {
        // Обработка события
    }
}
```

## Файлы для справки
- `config.py` - Конфигурация проекта (для интеграции)
- `database/models.py` - Модели PostgreSQL (для синхронизации схемы)

## Ссылки
- Spring Boot: https://spring.io/projects/spring-boot
- Spring Data JPA: https://spring.io/projects/spring-data-jpa
- Java документация: https://docs.oracle.com/en/java/
