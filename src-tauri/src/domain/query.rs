use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

const MAX_QUERY_BYTES: usize = 16 * 1024;
const MAX_TEXT_BYTES: usize = 4 * 1024;
const MAX_QUERY_NODES: usize = 128;
const MAX_QUERY_DEPTH: usize = 16;

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Expr {
    And {
        items: Vec<Expr>,
    },
    Or {
        items: Vec<Expr>,
    },
    Not {
        item: Box<Expr>,
    },
    Text {
        value: String,
    },
    Predicate {
        field: QueryField,
        op: QueryOperator,
        value: QueryValue,
    },
}

impl Expr {
    pub fn all() -> Self {
        Self::And { items: Vec::new() }
    }
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum QueryField {
    Title,
    Artist,
    AlbumArtist,
    Album,
    Genre,
    Composer,
    Year,
    Track,
    Disc,
    Duration,
    Codec,
    SampleRate,
    BitDepth,
    Channels,
    Bitrate,
    Path,
    AddedAt,
    LastPlayed,
    PlayCount,
    Favorite,
}

impl QueryField {
    pub fn parse(value: &str) -> Option<Self> {
        let normalized = value
            .chars()
            .filter(|character| *character != '_' && *character != '-')
            .flat_map(char::to_lowercase)
            .collect::<String>();
        match normalized.as_str() {
            "title" => Some(Self::Title),
            "artist" => Some(Self::Artist),
            "albumartist" => Some(Self::AlbumArtist),
            "album" => Some(Self::Album),
            "genre" => Some(Self::Genre),
            "composer" => Some(Self::Composer),
            "year" => Some(Self::Year),
            "track" => Some(Self::Track),
            "disc" => Some(Self::Disc),
            "duration" => Some(Self::Duration),
            "codec" => Some(Self::Codec),
            "samplerate" => Some(Self::SampleRate),
            "bitdepth" => Some(Self::BitDepth),
            "channels" => Some(Self::Channels),
            "bitrate" => Some(Self::Bitrate),
            "path" => Some(Self::Path),
            "addedat" => Some(Self::AddedAt),
            "lastplayed" => Some(Self::LastPlayed),
            "playcount" => Some(Self::PlayCount),
            "favorite" => Some(Self::Favorite),
            _ => None,
        }
    }

    pub fn value_kind(self) -> QueryValueKind {
        match self {
            Self::Title
            | Self::Artist
            | Self::AlbumArtist
            | Self::Album
            | Self::Genre
            | Self::Composer
            | Self::Codec
            | Self::Path => QueryValueKind::Text,
            Self::Favorite => QueryValueKind::Boolean,
            Self::Year
            | Self::Track
            | Self::Disc
            | Self::Duration
            | Self::SampleRate
            | Self::BitDepth
            | Self::Channels
            | Self::Bitrate
            | Self::AddedAt
            | Self::LastPlayed
            | Self::PlayCount => QueryValueKind::Number,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum QueryValueKind {
    Text,
    Number,
    Boolean,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum QueryOperator {
    Eq,
    Neq,
    Contains,
    Gt,
    Gte,
    Lt,
    Lte,
    In,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(untagged)]
pub enum QueryValue {
    Text(String),
    Number(f64),
    Boolean(bool),
    TextList(Vec<String>),
    NumberList(Vec<f64>),
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SortDirection {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct QuerySort {
    pub field: QueryField,
    pub direction: SortDirection,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EntityKind {
    Track,
    Album,
    Artist,
    Folder,
    Genre,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LayoutKind {
    Grid,
    List,
    Table,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, Type, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ViewDensity {
    Compact,
    Comfortable,
    Spacious,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
pub struct ViewLayout {
    pub kind: LayoutKind,
    pub density: ViewDensity,
    pub cover_size: Option<u32>,
    pub visible_fields: Vec<QueryField>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
pub struct ViewDefinition {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub entity: EntityKind,
    pub query: Expr,
    pub group_by: Vec<QueryField>,
    pub sort: Vec<QuerySort>,
    pub layout: ViewLayout,
    pub pin_to_sidebar: bool,
}

impl ViewDefinition {
    pub fn validate(&self) -> Result<(), String> {
        if self.schema_version != 1 {
            return Err(format!(
                "View schema version {} is unsupported",
                self.schema_version
            ));
        }
        if self.id.is_empty() || self.id.len() > 16 * 1024 {
            return Err("View ID is empty or exceeds the safety limit".to_owned());
        }
        if self.name.trim().is_empty() || self.name.len() > 16 * 1024 {
            return Err("View name is empty or exceeds the safety limit".to_owned());
        }
        if self.group_by.len() > 3 {
            return Err("A View may group by at most three levels".to_owned());
        }
        validate_expr(&self.query)
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QueryRequest {
    pub entity: EntityKind,
    pub query: Expr,
    pub sort: Vec<QuerySort>,
    pub page: u32,
    pub page_size: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SearchRequest {
    pub input: String,
    pub limit_per_section: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TrackDto {
    pub id: Uuid,
    pub rel_path: String,
    pub title: Option<String>,
    pub artist: Option<String>,
    pub artists: Vec<String>,
    pub album_artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<i32>,
    pub track_no: Option<u32>,
    pub disc_no: Option<u32>,
    pub genres: Vec<String>,
    pub composer: Option<String>,
    pub duration_ms: Option<f64>,
    pub codec: Option<String>,
    pub container: Option<String>,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u32>,
    pub channels: Option<u32>,
    pub bitrate: Option<u32>,
    pub artwork_key: Option<String>,
    pub added_at: f64,
    pub last_played: Option<f64>,
    pub play_count: u32,
    pub favorite: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AlbumDto {
    pub album_key: Uuid,
    pub title: String,
    pub album_artist: String,
    pub year: Option<i32>,
    pub track_count: u32,
    pub duration_ms: f64,
    pub artwork_key: Option<String>,
    pub unknown: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ArtistDto {
    pub artist_key: Uuid,
    pub name: String,
    pub album_count: u32,
    pub track_count: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FolderDto {
    pub path: String,
    pub name: String,
    pub track_count: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GenreDto {
    pub name: String,
    pub track_count: u32,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(tag = "kind", content = "items", rename_all = "camelCase")]
pub enum QueryItems {
    Tracks(Vec<TrackDto>),
    Albums(Vec<AlbumDto>),
    Artists(Vec<ArtistDto>),
    Folders(Vec<FolderDto>),
    Genres(Vec<GenreDto>),
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct QueryPage {
    pub entity: EntityKind,
    pub page: u32,
    pub page_size: u32,
    pub has_more: bool,
    pub items: QueryItems,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AlbumDetailDto {
    pub album: AlbumDto,
    pub tracks: Vec<TrackDto>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ArtistDetailDto {
    pub artist: ArtistDto,
    pub albums: Vec<AlbumDto>,
    pub tracks: Vec<TrackDto>,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NamedSearchResult {
    pub id: String,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSearchResults {
    pub query: Expr,
    pub artists: Vec<ArtistDto>,
    pub albums: Vec<AlbumDto>,
    pub tracks: Vec<TrackDto>,
    pub folders: Vec<FolderDto>,
    pub genres: Vec<GenreDto>,
    pub playlists: Vec<NamedSearchResult>,
    pub views: Vec<NamedSearchResult>,
}

pub fn built_in_views() -> Vec<ViewDefinition> {
    vec![
        built_in_view(
            "builtin:home",
            "Home",
            EntityKind::Track,
            LayoutKind::List,
            vec![QuerySort {
                field: QueryField::AddedAt,
                direction: SortDirection::Desc,
            }],
            true,
        ),
        built_in_view(
            "builtin:albums",
            "Albums",
            EntityKind::Album,
            LayoutKind::Grid,
            vec![QuerySort {
                field: QueryField::Album,
                direction: SortDirection::Asc,
            }],
            true,
        ),
        built_in_view(
            "builtin:artists",
            "Artists",
            EntityKind::Artist,
            LayoutKind::Grid,
            vec![QuerySort {
                field: QueryField::Artist,
                direction: SortDirection::Asc,
            }],
            true,
        ),
        built_in_view(
            "builtin:tracks",
            "Tracks",
            EntityKind::Track,
            LayoutKind::Table,
            vec![QuerySort {
                field: QueryField::Title,
                direction: SortDirection::Asc,
            }],
            true,
        ),
        built_in_view(
            "builtin:folders",
            "Folders",
            EntityKind::Folder,
            LayoutKind::List,
            vec![QuerySort {
                field: QueryField::Path,
                direction: SortDirection::Asc,
            }],
            true,
        ),
        built_in_view(
            "builtin:genres",
            "Genres",
            EntityKind::Genre,
            LayoutKind::List,
            vec![QuerySort {
                field: QueryField::Genre,
                direction: SortDirection::Asc,
            }],
            true,
        ),
        ViewDefinition {
            schema_version: 1,
            id: "builtin:favorites".to_owned(),
            name: "Favorites".to_owned(),
            icon: Some("heart".to_owned()),
            entity: EntityKind::Track,
            query: Expr::Predicate {
                field: QueryField::Favorite,
                op: QueryOperator::Eq,
                value: QueryValue::Boolean(true),
            },
            group_by: Vec::new(),
            sort: vec![QuerySort {
                field: QueryField::Title,
                direction: SortDirection::Asc,
            }],
            layout: ViewLayout {
                kind: LayoutKind::Table,
                density: ViewDensity::Comfortable,
                cover_size: None,
                visible_fields: vec![
                    QueryField::Title,
                    QueryField::Artist,
                    QueryField::Album,
                    QueryField::Duration,
                ],
            },
            pin_to_sidebar: true,
        },
        built_in_view(
            "builtin:recently-added",
            "Recently Added",
            EntityKind::Track,
            LayoutKind::List,
            vec![QuerySort {
                field: QueryField::AddedAt,
                direction: SortDirection::Desc,
            }],
            false,
        ),
        ViewDefinition {
            schema_version: 1,
            id: "builtin:recently-played".to_owned(),
            name: "Recently Played".to_owned(),
            icon: Some("history".to_owned()),
            entity: EntityKind::Track,
            query: Expr::Predicate {
                field: QueryField::LastPlayed,
                op: QueryOperator::Gt,
                value: QueryValue::Number(0.0),
            },
            group_by: Vec::new(),
            sort: vec![QuerySort {
                field: QueryField::LastPlayed,
                direction: SortDirection::Desc,
            }],
            layout: ViewLayout {
                kind: LayoutKind::List,
                density: ViewDensity::Comfortable,
                cover_size: Some(64),
                visible_fields: vec![
                    QueryField::Title,
                    QueryField::Artist,
                    QueryField::Album,
                    QueryField::LastPlayed,
                ],
            },
            pin_to_sidebar: false,
        },
        ViewDefinition {
            schema_version: 1,
            id: "builtin:never-played".to_owned(),
            name: "Never Played".to_owned(),
            icon: Some("circle".to_owned()),
            entity: EntityKind::Track,
            query: Expr::Predicate {
                field: QueryField::PlayCount,
                op: QueryOperator::Eq,
                value: QueryValue::Number(0.0),
            },
            group_by: Vec::new(),
            sort: vec![QuerySort {
                field: QueryField::Title,
                direction: SortDirection::Asc,
            }],
            layout: ViewLayout {
                kind: LayoutKind::Table,
                density: ViewDensity::Comfortable,
                cover_size: None,
                visible_fields: vec![
                    QueryField::Title,
                    QueryField::Artist,
                    QueryField::Album,
                    QueryField::Duration,
                ],
            },
            pin_to_sidebar: false,
        },
    ]
}

fn built_in_view(
    id: &str,
    name: &str,
    entity: EntityKind,
    kind: LayoutKind,
    sort: Vec<QuerySort>,
    pin_to_sidebar: bool,
) -> ViewDefinition {
    ViewDefinition {
        schema_version: 1,
        id: id.to_owned(),
        name: name.to_owned(),
        icon: None,
        entity,
        query: Expr::all(),
        group_by: Vec::new(),
        sort,
        layout: ViewLayout {
            kind,
            density: ViewDensity::Comfortable,
            cover_size: (kind == LayoutKind::Grid).then_some(192),
            visible_fields: vec![
                QueryField::Title,
                QueryField::Artist,
                QueryField::Album,
                QueryField::Year,
                QueryField::Duration,
            ],
        },
        pin_to_sidebar,
    }
}

pub fn parse_query(input: &str) -> Result<Expr, String> {
    if input.len() > MAX_QUERY_BYTES {
        return Err("Search query exceeds the 16 KiB safety limit".to_owned());
    }
    let tokens = lex(input)?;
    if tokens.is_empty() {
        return Ok(Expr::all());
    }
    let mut parser = Parser::new(tokens);
    let expression = parser.parse_or()?;
    if parser.peek().is_some() {
        return Err("Unexpected token after the search expression".to_owned());
    }
    validate_expr(&expression)?;
    Ok(expression)
}

pub fn validate_expr(expression: &Expr) -> Result<(), String> {
    let mut nodes = 0;
    validate_node(expression, 0, &mut nodes)
}

fn validate_node(expression: &Expr, depth: usize, nodes: &mut usize) -> Result<(), String> {
    *nodes += 1;
    if *nodes > MAX_QUERY_NODES {
        return Err(format!(
            "A query may contain at most {MAX_QUERY_NODES} nodes"
        ));
    }
    if depth > MAX_QUERY_DEPTH {
        return Err(format!(
            "A query may be nested at most {MAX_QUERY_DEPTH} levels"
        ));
    }
    match expression {
        Expr::And { items } | Expr::Or { items } => {
            if matches!(expression, Expr::Or { .. }) && items.is_empty() {
                return Err("An OR expression may not be empty".to_owned());
            }
            for item in items {
                validate_node(item, depth + 1, nodes)?;
            }
        }
        Expr::Not { item } => validate_node(item, depth + 1, nodes)?,
        Expr::Text { value } => validate_text(value)?,
        Expr::Predicate { field, op, value } => validate_predicate(*field, *op, value)?,
    }
    Ok(())
}

fn validate_text(value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err("Query text may not be empty".to_owned());
    }
    if value.len() > MAX_TEXT_BYTES {
        return Err("A query value exceeds the 4 KiB safety limit".to_owned());
    }
    Ok(())
}

fn validate_predicate(
    field: QueryField,
    operator: QueryOperator,
    value: &QueryValue,
) -> Result<(), String> {
    let valid_operator = match field.value_kind() {
        QueryValueKind::Text => matches!(
            operator,
            QueryOperator::Eq | QueryOperator::Neq | QueryOperator::Contains | QueryOperator::In
        ),
        QueryValueKind::Number => matches!(
            operator,
            QueryOperator::Eq
                | QueryOperator::Neq
                | QueryOperator::Gt
                | QueryOperator::Gte
                | QueryOperator::Lt
                | QueryOperator::Lte
                | QueryOperator::In
        ),
        QueryValueKind::Boolean => matches!(operator, QueryOperator::Eq | QueryOperator::Neq),
    };
    if !valid_operator {
        return Err(format!(
            "Operator {operator:?} is not valid for field {field:?}"
        ));
    }
    let valid_value = if operator == QueryOperator::In {
        matches!(
            (field.value_kind(), value),
            (QueryValueKind::Text, QueryValue::TextList(_))
                | (QueryValueKind::Number, QueryValue::NumberList(_))
        )
    } else {
        matches!(
            (field.value_kind(), value),
            (QueryValueKind::Text, QueryValue::Text(_))
                | (QueryValueKind::Number, QueryValue::Number(_))
                | (QueryValueKind::Boolean, QueryValue::Boolean(_))
        )
    };
    if !valid_value {
        return Err(format!("Value type is not valid for field {field:?}"));
    }
    match value {
        QueryValue::Text(value) => validate_text(value),
        QueryValue::TextList(values) => {
            if values.is_empty() || values.len() > 100 {
                return Err("An IN list must contain between 1 and 100 values".to_owned());
            }
            values.iter().try_for_each(|value| validate_text(value))
        }
        QueryValue::NumberList(values) => validate_list_length(values.len()),
        QueryValue::Number(value) if !value.is_finite() => {
            Err("Numeric query values must be finite".to_owned())
        }
        QueryValue::Number(_) | QueryValue::Boolean(_) => Ok(()),
    }
}

fn validate_list_length(length: usize) -> Result<(), String> {
    if (1..=100).contains(&length) {
        Ok(())
    } else {
        Err("An IN list must contain between 1 and 100 values".to_owned())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Word(String),
    Phrase(String),
    Colon,
    LeftParen,
    RightParen,
    Minus,
    Or,
    Not,
}

fn lex(input: &str) -> Result<Vec<Token>, String> {
    let characters = input.chars().collect::<Vec<_>>();
    let mut tokens = Vec::new();
    let mut index = 0;
    while index < characters.len() {
        match characters[index] {
            character if character.is_whitespace() => index += 1,
            '(' => {
                tokens.push(Token::LeftParen);
                index += 1;
            }
            ')' => {
                tokens.push(Token::RightParen);
                index += 1;
            }
            ':' => {
                tokens.push(Token::Colon);
                index += 1;
            }
            '-' => {
                tokens.push(Token::Minus);
                index += 1;
            }
            '"' => {
                index += 1;
                let mut value = String::new();
                let mut closed = false;
                while index < characters.len() {
                    match characters[index] {
                        '\\' if index + 1 < characters.len()
                            && matches!(characters[index + 1], '"' | '\\') =>
                        {
                            value.push(characters[index + 1]);
                            index += 2;
                        }
                        '"' => {
                            closed = true;
                            index += 1;
                            break;
                        }
                        character => {
                            value.push(character);
                            index += 1;
                        }
                    }
                }
                if !closed {
                    return Err("Search query contains an unterminated quote".to_owned());
                }
                tokens.push(Token::Phrase(value));
            }
            _ => {
                let start = index;
                while index < characters.len()
                    && !characters[index].is_whitespace()
                    && !matches!(characters[index], '(' | ')' | ':' | '"')
                {
                    index += 1;
                }
                let value = characters[start..index].iter().collect::<String>();
                if value.eq_ignore_ascii_case("OR") {
                    tokens.push(Token::Or);
                } else if value.eq_ignore_ascii_case("NOT") {
                    tokens.push(Token::Not);
                } else {
                    tokens.push(Token::Word(value));
                }
            }
        }
    }
    Ok(tokens)
}

struct Parser {
    tokens: Vec<Token>,
    index: usize,
}

impl Parser {
    fn new(tokens: Vec<Token>) -> Self {
        Self { tokens, index: 0 }
    }

    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.index)
    }

    fn take(&mut self) -> Option<Token> {
        let token = self.tokens.get(self.index).cloned();
        if token.is_some() {
            self.index += 1;
        }
        token
    }

    fn parse_or(&mut self) -> Result<Expr, String> {
        let mut items = vec![self.parse_and()?];
        while matches!(self.peek(), Some(Token::Or)) {
            self.take();
            items.push(self.parse_and()?);
        }
        if items.len() == 1 {
            Ok(items.remove(0))
        } else {
            Ok(Expr::Or { items })
        }
    }

    fn parse_and(&mut self) -> Result<Expr, String> {
        let mut items = Vec::new();
        while !matches!(self.peek(), None | Some(Token::Or | Token::RightParen)) {
            items.push(self.parse_unary()?);
        }
        if items.is_empty() {
            return Err("Expected a search expression".to_owned());
        }
        if items.len() == 1 {
            Ok(items.remove(0))
        } else {
            Ok(Expr::And { items })
        }
    }

    fn parse_unary(&mut self) -> Result<Expr, String> {
        if matches!(self.peek(), Some(Token::Not | Token::Minus)) {
            self.take();
            return Ok(Expr::Not {
                item: Box::new(self.parse_unary()?),
            });
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Result<Expr, String> {
        match self.take() {
            Some(Token::LeftParen) => {
                let expression = self.parse_or()?;
                if !matches!(self.take(), Some(Token::RightParen)) {
                    return Err("Search query contains an unmatched parenthesis".to_owned());
                }
                Ok(expression)
            }
            Some(Token::Word(value)) => {
                if matches!(self.peek(), Some(Token::Colon)) {
                    self.take();
                    self.parse_predicate(value)
                } else {
                    Ok(Expr::Text { value })
                }
            }
            Some(Token::Phrase(value)) => Ok(Expr::Text { value }),
            Some(Token::RightParen) => Err("Unexpected closing parenthesis".to_owned()),
            Some(Token::Colon | Token::Or | Token::Not | Token::Minus) | None => {
                Err("Expected a search term or predicate".to_owned())
            }
        }
    }

    fn parse_predicate(&mut self, field_name: String) -> Result<Expr, String> {
        let field = QueryField::parse(&field_name)
            .ok_or_else(|| format!("Unknown query field: {field_name}"))?;
        let negative = matches!(self.peek(), Some(Token::Minus));
        if negative {
            self.take();
        }
        let raw = match self.take() {
            Some(Token::Word(value) | Token::Phrase(value)) => value,
            _ => return Err(format!("Field {field_name} requires a value")),
        };
        let raw = if negative { format!("-{raw}") } else { raw };
        let (operator, raw_value) = split_operator(field.value_kind(), &raw)?;
        let value = parse_predicate_value(field, raw_value)?;
        Ok(Expr::Predicate {
            field,
            op: operator,
            value,
        })
    }
}

fn split_operator(kind: QueryValueKind, raw: &str) -> Result<(QueryOperator, &str), String> {
    let candidates = [
        (">=", QueryOperator::Gte),
        ("<=", QueryOperator::Lte),
        ("!=", QueryOperator::Neq),
        (">", QueryOperator::Gt),
        ("<", QueryOperator::Lt),
        ("=", QueryOperator::Eq),
    ];
    for (prefix, operator) in candidates {
        if let Some(value) = raw.strip_prefix(prefix) {
            if value.is_empty() {
                return Err("A query operator requires a value".to_owned());
            }
            return Ok((operator, value));
        }
    }
    Ok((
        if kind == QueryValueKind::Text {
            QueryOperator::Contains
        } else {
            QueryOperator::Eq
        },
        raw,
    ))
}

fn parse_predicate_value(field: QueryField, raw: &str) -> Result<QueryValue, String> {
    match field.value_kind() {
        QueryValueKind::Text => Ok(QueryValue::Text(raw.to_owned())),
        QueryValueKind::Number => raw
            .parse::<f64>()
            .map(QueryValue::Number)
            .map_err(|_| format!("Field {field:?} requires a number")),
        QueryValueKind::Boolean => match raw.to_ascii_lowercase().as_str() {
            "true" | "1" | "yes" => Ok(QueryValue::Boolean(true)),
            "false" | "0" | "no" => Ok(QueryValue::Boolean(false)),
            _ => Err(format!("Field {field:?} requires true or false")),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::{
        built_in_views, parse_query, Expr, QueryField, QueryOperator, QueryValue, ViewDefinition,
    };

    #[test]
    fn parser_supports_free_text_quotes_predicates_and_precedence() {
        let parsed = parse_query(
            r#"sleep "even in arcadia" artist:"Sleep Token" year:>=2020 OR -favorite:true"#,
        )
        .unwrap();

        let Expr::Or { items } = parsed else {
            panic!("expected OR at the root")
        };
        assert_eq!(items.len(), 2);
        let Expr::And { items: left } = &items[0] else {
            panic!("expected implicit AND")
        };
        assert_eq!(left.len(), 4);
        assert_eq!(
            left[2],
            Expr::Predicate {
                field: QueryField::Artist,
                op: QueryOperator::Contains,
                value: QueryValue::Text("Sleep Token".to_owned())
            }
        );
        assert!(matches!(items[1], Expr::Not { .. }));
    }

    #[test]
    fn parser_rejects_unknown_fields_and_unbalanced_input() {
        assert!(parse_query("unknown:value")
            .unwrap_err()
            .contains("Unknown"));
        assert!(parse_query("(artist:test").is_err());
        assert!(parse_query("artist:\"test").is_err());
    }

    #[test]
    fn view_definition_roundtrip_preserves_the_contract() {
        let view = built_in_views().remove(0);
        let json = serde_json::to_string_pretty(&view).unwrap();
        let decoded: ViewDefinition = serde_json::from_str(&json).unwrap();
        decoded.validate().unwrap();
        assert_eq!(decoded, view);
    }
}
